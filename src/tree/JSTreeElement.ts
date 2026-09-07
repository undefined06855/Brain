import { Node, type HTMLElement } from "happy-dom";
import TreeElement from "./TreeElement";
import type { GenerationContext } from "../GenerationContext";

/**
 * A tree element which repesents inline JavaScript which runs in the browser.
 * Matched by comments that look like <!--{{ return "hi" }}--> and match no other possible tree elements.
 */
export class JSTreeElement extends TreeElement {
    private static regex = /\s*{{\s*((?:.|\n)+)\s*}}\s*/;

    private functionSource: string;

    constructor(root: HTMLElement) {
        super(root);
        let results = JSTreeElement.regex.exec(this.root.textContent);
        if (!results) throw new Error("unreachable");

        this.functionSource = results[1]!;
    }

    static override matches(element: Node): boolean {
        if (element.nodeType != Node.COMMENT_NODE) return false;
        return !!JSTreeElement.regex.exec(element.textContent);
    }

    override isCacheable() {
        return false;
    }

    override generateClientJS(): string {
        return `
            document.createTextNode((() => {
                const SIDE = "client";
                ${this.functionSource}
            })() ?? "")
        `.trim();
    }

    override generateServerHTML(context: GenerationContext): string {
        let evalString = `
            (() => {
                const SIDE = "server";
                ${this.functionSource}
            })() ?? ""
        `.trim();

        return eval(evalString);
    }
}
