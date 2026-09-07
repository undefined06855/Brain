import { HTMLElement, Window } from "happy-dom";
import { Result } from "result-js";
import type { GenerationContext } from "./GenerationContext";
import {
    TextTreeElement,
    ParamTreeElement,
    JSTreeElement,
    ComponentTreeElement,
    ElementTreeElement,
    DependencyTreeElement,
} from "./tree";
import TreeElement from "./tree/TreeElement";

// in order of priority
// since something like JSTreeElement will match for comments which should be ParamTreeElements, it is placed later
// this is iterated in the ElementTreeElement constructor
TreeElement.treeElementTypes.push(TextTreeElement);
TreeElement.treeElementTypes.push(DependencyTreeElement);
TreeElement.treeElementTypes.push(ComponentTreeElement);
TreeElement.treeElementTypes.push(ParamTreeElement);
TreeElement.treeElementTypes.push(JSTreeElement);
TreeElement.treeElementTypes.push(ElementTreeElement);

export default class ComponentTree {
    private name: string;
    private htmlString: string;
    private root: HTMLElement | null = null;
    private head: ElementTreeElement | null = null;
    private initialized: boolean = false;

    /**
     * @param {string} name
     * @param {string} htmlString
     */
    constructor(name: string, htmlString: string) {
        this.name = name;
        this.htmlString = htmlString;
    }

    init(): Result {
        let window = new Window();
        window.document.body.innerHTML = this.htmlString;

        if (window.document.body.children.length != 1) {
            return Result.err(
                `component must be made of exactly one HTML element, found ${window.document.body.children.length}`,
            );
        }

        let child = window.document.body.children[0]!;

        if (!(child instanceof HTMLElement)) {
            return Result.err(`expected one child to be instanceof HTMLElement, found ${typeof child}`);
        }

        this.root = child;
        this.head = new ElementTreeElement(this.root);

        this.initialized = true;
        return Result.ok();
    }

    generateClientJS(): Result<string> {
        if (!this.initialized) return Result.err("component tree has not been initialized yet");

        return Result.ok(`
                !(() => {
                    window[${JSON.stringify(this.name)}] = ((params = {}) => {
                        return ${this.head!.generateClientJS()}
                    });
                })();
            `.trim(),
        );
    }

    generateServerHTML(context: GenerationContext): Result<string> {
        if (!this.initialized) return Result.err("component tree has not been initialized yet");

        if (context.debug) {
            return Result.ok(`
                <!-- begin ${this.name} -->
                    ${this.head!.generateServerHTML(context)}
                <!-- end ${this.name} -->
            `.trim());
        } else {
            return Result.ok(this.head!.generateServerHTML(context));
        }

    }

    getDependencies(): Result<Array<string>> {
        if (!this.initialized) return Result.err("component tree has not been initialized yet");

        return Result.ok(this.head!.getDependencies());
    }

    getParameters(): Result<Array<string>> {
        if (!this.initialized) return Result.err("component tree has not been initialized yet");

        return Result.ok(this.head!.getParameters());
    }

    isCacheable(): Result<boolean> {
        if (!this.initialized) return Result.err("component tree has not been initialized yet");

        return Result.ok(this.head!.isCacheable());
    }
}
