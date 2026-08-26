import { Node } from "happy-dom";
import type { GenerationContext } from "../GenerationContext";
import TreeElement from "./TreeElement";

export class DependencyTreeElement extends TreeElement {
    private static regex = /\s*{{\s*dependency:\s*(.+)\s*}}\s*/;

    private componentName: string;

    constructor(root: Node) {
        super(root);
        let results = DependencyTreeElement.regex.exec(this.root.textContent);
        if (!results) throw new Error("unreachable");

        this.componentName = results[1]!.trim();
    }

    static override matches(element: Node): boolean {
        if (element.nodeType != Node.COMMENT_NODE) return false;
        return !!DependencyTreeElement.regex.exec(element.textContent);
    }

    override isCacheable() {
        return true;
    }

    override generateClientJS(): string {
        return `document.createTextNode(\\"\\")`;
    }

    override generateServerHTML(context: GenerationContext): string {
        return "";
    }

    getComponentName() {
        return this.componentName;
    }
}
