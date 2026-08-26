import { Node } from "happy-dom";
import type { GenerationContext } from "../GenerationContext";
import TreeElement from "./TreeElement";

export class ParamTreeElement extends TreeElement {
    private static regex = /\s*{{\s*param:\s*(.+)\s*}}\s*/;

    private paramName: string;

    constructor(root: Node) {
        super(root);
        let results = ParamTreeElement.regex.exec(this.root.textContent);
        if (!results) throw new Error("unreachable");

        this.paramName = results[1]!.trim();
    }

    static override matches(element: Node): boolean {
        if (element.nodeType != Node.COMMENT_NODE) return false;
        return !!ParamTreeElement.regex.exec(element.textContent);
    }

    override isCacheable() {
        return false;
    }

    override generateClientJS(): string {
        return `document.createTextNode(params[${JSON.stringify(this.paramName)}] ?? "(param \\"" + ${JSON.stringify(this.paramName)} + "\\" which was not provided)")`;
    }

    override generateServerHTML(context: GenerationContext): string {
        return context.params[this.paramName] ?? `(param "${this.paramName}" which was not provided)`;
    }

    getParamName() {
        return this.paramName;
    }
}