import { Node } from "happy-dom";
import type { GenerationContext } from "../GenerationContext";
import TreeElement from "./TreeElement";
import type { StringMap } from "../utils";

/**
 * A tree element which repesents a nested component.
 * Matched by comments that look like <!--{{ component: hello }}-->.
 */
export class ComponentTreeElement extends TreeElement {
    // im so regex rn
    private static regex = /\s*{{\s*component:\s*(.+?)\s*(?:\n\s*([\s\S]*?)\s*)?}}\s*/;

    private componentName: string;
    private params: StringMap;

    constructor(root: Node) {
        super(root);
        let results = ComponentTreeElement.regex.exec(this.root.textContent);
        if (!results) throw new Error("unreachable");

        this.componentName = results[1]!;

        // parse params which are newline separated key=value pairs (both are strings)
        this.params = {};
        if (results[2]) {
            let pairs = results[2].split("\n");
            for (let pair of pairs) {
                let split = pair.trim().split("=");
                let key = split.shift()!;
                let value = split.join("=");
                this.params[key] = value;
            }
        }
    }

    static override matches(element: Node): boolean {
        if (element.nodeType != Node.COMMENT_NODE) return false;
        return !!ComponentTreeElement.regex.exec(element.textContent);
    }

    override isCacheable() {
        // TODO: need to know if the component has every single parameter fulfilled by something above
        return false;
    }

    override generateClientJS(): string {
        return `
            ${this.componentName}({
                ...params,
                ...${JSON.stringify(this.params)}
            })
        `.trim();
    }

    override generateServerHTML(context: GenerationContext): string {
        return context.brain
            .generateServerHTMLForComponent(this.componentName, {
                ...context.params,
                ...this.params,
            })
            .merge();
    }

    getComponentName() {
        return this.componentName;
    }

    getParams() {
        return this.params;
    }
}
