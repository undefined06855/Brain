import { Node } from "happy-dom";
import type { GenerationContext } from "../GenerationContext";
import TreeElement from "./TreeElement";

export class TextTreeElement extends TreeElement {
    private contents: string;

    constructor(root: Node) {
        super(root);
        this.contents = root.textContent.trim();
    }

    static override matches(element: Node): boolean {
        return element.nodeType == Node.TEXT_NODE && element.textContent.trim() != "";
    }

    override isCacheable() {
        return true;
    }

    override generateClientJS(): string {
        return `document.createTextNode(${JSON.stringify(this.contents)})`;
    }

    override generateServerHTML(context: GenerationContext): string {
        return `${this.contents}`;
    }

    getContents() {
        return this.contents;
    }
}
