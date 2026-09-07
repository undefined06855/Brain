import type { Brain } from "./brain";
import type { ParameterMap } from "./utils";

export class GenerationContext {
    public readonly brain: Brain;
    public readonly params: ParameterMap;
    public readonly debug: boolean;

    constructor(brain: Brain, params: ParameterMap = {}) {
        this.brain = brain;
        this.params = params;
        this.debug = brain.getConfig().debug;
    }
}
