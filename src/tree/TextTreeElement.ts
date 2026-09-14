import { Node } from "happy-dom";
import type { GenerationContext } from "../GenerationContext";
import TreeElement from "./TreeElement";
import * as entities from "html-entities";

export class TextTreeElement extends TreeElement {
    private contents: string;

    constructor(root: Node) {
        super(root);
        this.contents = root.textContent;
    }

    static override matches(element: Node): boolean {
        return element.nodeType == Node.TEXT_NODE && element.textContent.trim() != "";
    }

    override isCacheable() {
        return true;
    }

    override generateClientJS(): string {
        return `document.createTextNode(${JSON.stringify(entities.decode(this.contents))})`;
    }

    override generateServerHTML(context: GenerationContext): string {
        return `${this.contents}`;
    }

    override generateHeadHTML(context: GenerationContext): string {
        return "";
    }

    getContents() {
        return this.contents;
    }
}
