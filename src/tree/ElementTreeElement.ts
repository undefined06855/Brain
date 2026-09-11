import { HTMLElement, Node } from "happy-dom";
import TreeElement from "./TreeElement";
import type { StringMap } from "../utils";
import type { GenerationContext } from "../GenerationContext";
import { ParamTreeElement } from "./ParamTreeElement";
import { DependencyTreeElement } from "./DependencyTreeElement";

/**
 * A tree element which repesents just any normal HTML element.
 * Matches HTMLElements with nodeType Node.ELEMENT_NODE
 */
export class ElementTreeElement extends TreeElement {
    private nodeName: string;
    private attributes: StringMap;
    private childNodes: Array<TreeElement>;

    constructor(root: Node) {
        super(root);
        this.nodeName = this.root.nodeName.toLowerCase();

        if (!(this.root instanceof HTMLElement)) throw new Error("unreachable");
        this.attributes = Object.fromEntries(Array.from(this.root.attributes).map(attr => [attr.name, attr.value]));

        this.childNodes = [];
        for (let child of this.root.childNodes) {
            let found = false;
            for (let type of TreeElement.treeElementTypes) {
                if (type.matches(child)) {
                    this.childNodes.push(new (type as typeof ElementTreeElement)(child));
                    found = true;
                    break;
                }
            }

            if (!found && child.nodeType == Node.COMMENT_NODE) {
                console.warn(`Comment node was discarded: ${child}`);
            }
        }
    }

    static override matches(element: Node): boolean {
        return element.nodeType == Node.ELEMENT_NODE;
    }

    override isCacheable() {
        // return false if any child is not cacheable
        return !this.childNodes.some(child => !child.isCacheable);
    }

    override generateClientJS(): string {
        let attributeString = "";
        let childrenString = "";

        for (let [name, value] of Object.entries(this.attributes)) {
            attributeString += `ret.setAttribute(${JSON.stringify(name)}, ${JSON.stringify(value)});`;
        }

        for (let child of this.childNodes) {
            childrenString += `ret.appendChild(${child.generateClientJS()});`;
        }

        return `
            (() => {
                let ret = document.createElement(${JSON.stringify(this.nodeName)});
                ${attributeString}
                ${childrenString}
                return ret;
            })()
        `.trim();
    }

    override generateServerHTML(context: GenerationContext): string {
        return `
            <${this.nodeName} ${Object.entries(this.attributes)
                .map(([name, value]) => `${name}="${value}"`)
                .join(" ")}>
                ${this.childNodes.map(child => child.generateServerHTML(context)).join("")}
            </${this.nodeName}>
        `.trim();
    }

    /**
     * @returns {Array<string>}
     */
    getParameters(): Array<string> {
        let ret = [];

        for (let child of this.childNodes) {
            if (child instanceof ElementTreeElement) ret.push(...child.getParameters());
            if (child instanceof ParamTreeElement) ret.push(child.getParamName());
        }

        return ret;
    }

    /**
     * @returns {Array<string>}
     */
    getDependencies(): Array<string> {
        let ret = [];

        for (let child of this.childNodes) {
            if (child instanceof ElementTreeElement) ret.push(...child.getDependencies());
            if (child instanceof DependencyTreeElement) ret.push(child.getComponentName());
        }

        return ret;
    }
}
