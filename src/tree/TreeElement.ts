import type { Node } from "happy-dom";
import type { GenerationContext } from "../GenerationContext";

/**
 * The base class for all elements in the component tree to inherit from. Along with the required abstract functions,
 * the static `matches` function must also be overridden.
 */
export default abstract class TreeElement {
    static treeElementTypes: Array<typeof TreeElement> = [];

    public root: Node;

    constructor(root: Node) {
        this.root = root;
    }

    /**
     * Returns true if this element is applicable for this HTML element. Must be overridden by all subclasses.
     * @param element The HTML element to check against.
     */
    static matches(element: Node): boolean {
        throw new Error("TreeElement#matches must be overridden by subclasses!");
    }

    abstract isCacheable(): boolean;
    abstract generateClientJS(): string;
    abstract generateServerHTML(context: GenerationContext): string;
}
