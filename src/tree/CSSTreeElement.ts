import { Node } from "happy-dom";
import { ElementTreeElement } from "./ElementTreeElement";
import type { GenerationContext } from "../GenerationContext";

export class CSSTreeElement extends ElementTreeElement {
    constructor(root: Node) {
        super(root);
    }

    static override matches(element: Node): boolean {
        return element.nodeType == Node.ELEMENT_NODE && element.nodeName == "STYLE";
    }

    override generateServerHTML(context: GenerationContext): string {
        return "";
    }

    override generateHeadHTML(context: GenerationContext): string {
        if (context.debug) {
            return `
                <!-- begin head html css -->
                ${super.generateServerHTML(context)}
                <!-- end head html css -->
            `;
        } else {
            return super.generateServerHTML(context);
        }
    }
}
