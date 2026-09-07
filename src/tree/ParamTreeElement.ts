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
        if (!context.params[this.paramName]) {
            return `
                <!--
                    debug note: parameter ${this.paramName} was not found out of ${Object.entries(context.params).length} parameters:
                    ${Object.entries(context.params)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join("\n")}
                -->

                (param "${this.paramName}" which was not provided)
            `.trim();
        }

        if (context.debug) {
            return `<!-- parameter ${this.paramName}--> ${context.params[this.paramName]} <!-- end param -->`;
        } else {
            return context.params[this.paramName];
        }
    }

    getParamName() {
        return this.paramName;
    }
}
