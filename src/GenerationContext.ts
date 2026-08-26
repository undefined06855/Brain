import type { Brain } from "./brain";
import type { StringMap } from "./utils";

export class GenerationContext {
    public readonly brain: Brain;
    public readonly params: StringMap;

    constructor(brain: Brain, params: StringMap = {}) {
        this.brain = brain;
        this.params = params;
    }
}
