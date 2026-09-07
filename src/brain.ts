import { Result } from "result-js";
import * as fs from "fs/promises";
import ComponentTree from "./ComponentTree";
import { errorMessageMap, type ParameterMap, type StringMap } from "./utils";
import { GenerationContext } from "./GenerationContext";
import type { BunFile } from "bun";
import type { HTMLElement } from "happy-dom";

export class InvalidConfigError extends Error {
    constructor() {
        super("The config passed to Brain was invalid! Check that you've filled out all required properties.");
        this.name = "InvalidConfigError";
    }
}

/**
 * A class to configure Brain with. You should use builder syntax with this class, though you can always edit attributes
 * manually. You must at least set the site data path, else this will throw an exception.
 */
export class BrainConfig {
    debug: boolean = false;
    siteDataPath: string | null = null;

    /**
     * Returns true if this is a valid config. At the moment, the only required config to set is the site data path.
     */
    validate(): boolean {
        if (this.siteDataPath == null) return false;
        return true;
    }

    /**
     * Sets whether Brain should add debug information into the sites it generates in the form of comments in the HTML.
     */
    setDebug(debug: boolean) {
        this.debug = debug;
        return this;
    }

    /**
     * Sets the path for where Brain gets components from. This is required for the server to start. On Windows,
     * backslashes in the file path are replaced with forward slashes.
     */
    setSiteDataPath(siteDataPath: string) {
        this.siteDataPath = siteDataPath;
        return this;
    }
}

/**
 * The main Brain class. You should instantiate an instance of this class, passing in the path to the datas needed, then
 * call and await Brain#init, which will read the paths and files inside them. Then, in your server handler, call
 * Brain#generateRoute.
 *
 * To pass in a config, create an instance of a BrainConfig class and use the builder pattern. You must set at least
 * the site data path using BrainConfig#setSiteDataPath!
 *
 * The path you give to the site data path in the config should have a file layout that looks like the following:
 * ```plaintext
 * /
 * ├── main.js
 * └── my-site
 *     ├── components
 *     │   ├── MyComponent.html
 *     │   └── EpicComponent.html
 *     ├── routes
 *     │   ├── index.html
 *     │   └── user
 *     │       ├── index.html
 *     │       └── logout.html
 *     └── special
 *         ├── skeleton.html
 *         └── error.html
 * ```
 *
 * (passing "./my-site" from main.js)
 *
 * In the special/ directory, you must have the following files:
 *   - skeleton.html     Defines the "skeleton" of the website, the head and body tags. Brain will automatically
 *                       populate the head and body tags around what you provide in them, so you can leave the body
 *                       tag empty and it will be filled out by the contents of the route.
 *   - error.html        Defines the error page for errors like 404 and 500. The parameter Brain.errorCode holds the
 *                       error code and Brain.errorMessage holds the error message.
 *
 * Note that internally, routes are also components.
 */
export class Brain {
    private static readonly specialRawPages = ["skeleton"] as const;
    private static readonly specialComponentPages = ["error"] as const;

    private config: BrainConfig;
    private siteDataPath: string;

    private components: Record<string, ComponentTree>;
    private routes: Record<string, ComponentTree>;
    private staticFiles: Record<string, BunFile>;
    private specialRaws: Record<(typeof Brain.specialRawPages)[number], string>;
    private specialComponents: Record<(typeof Brain.specialComponentPages)[number], ComponentTree>;
    private hooks: Record<string, HTMLRewriterTypes.HTMLRewriterElementContentHandlers>;

    constructor(config: BrainConfig) {
        if (!config.validate()) {
            throw new InvalidConfigError();
        }

        this.config = config;
        this.siteDataPath = this.config.siteDataPath!;

        // cut off ./ since fs.readdir doesn't prepend it
        if (this.siteDataPath.startsWith("./")) {
            this.siteDataPath = this.siteDataPath.slice(2);
        }

        this.components = {};
        this.routes = {};
        this.staticFiles = {};

        // @ts-ignore since we don't define each one explicitly
        this.specialRaws = {};

        // @ts-ignore
        this.specialComponents = {};

        this.hooks = {};
    }

    /**
     * Initialises Brain, reads every component and every route, and reads the special files.
     */
    async init() {
        // read components
        for (let info of await fs.readdir(`${this.siteDataPath}/components`, {
            withFileTypes: true,
            recursive: true,
        })) {
            if (info.isDirectory()) continue;
            if (process.platform == "win32") info.parentPath = info.parentPath.replaceAll("\\", "/");

            let file = Bun.file(`${info.parentPath}/${info.name}`);

            // note: no preceding slash here
            let path = info.parentPath.replace(`${this.siteDataPath}/components/`, "");
            let route = `${path}/${info.name}`;
            let split = route.split(".");
            split.pop();
            let stem = split.join(".");

            await this.registerComponent(stem, file);
        }

        // read routes (which are also technically components but with extra checks and parsing)
        for (let info of await fs.readdir(`${this.siteDataPath}/routes`, { withFileTypes: true, recursive: true })) {
            if (info.isDirectory()) continue;
            if (process.platform == "win32") info.parentPath = info.parentPath.replaceAll("\\", "/");

            let file = Bun.file(`${info.parentPath}/${info.name}`);

            // note: preceding slash here
            let path = info.parentPath.replace(`${this.siteDataPath}/routes`, "");
            let name = info.name == "index.html" ? "" : info.name;
            let route = `${path}/${name}`;
            if (route.endsWith("/") && route != "/") route = route.slice(0, -1);

            await this.registerRoute(route, file);
        }

        // read static files (which are just stored as BunFiles)
        for (let info of await fs.readdir(`${this.siteDataPath}/static`, { withFileTypes: true, recursive: true })) {
            if (info.isDirectory()) continue;
            if (process.platform == "win32") info.parentPath = info.parentPath.replaceAll("\\", "/");

            let file = Bun.file(`${info.parentPath}/${info.name}`);

            // note: preceding slash here and index.html is not accounted for
            let path = info.parentPath.replace(`${this.siteDataPath}/static`, "");
            let route = `${path}/${info.name}`;

            await this.registerStaticFile(route, file);
        }

        // read special thingymabobs
        for (let page of Brain.specialRawPages) {
            this.specialRaws[page] = await Bun.file(`${this.siteDataPath}/special/${page}.html`).text();
        }

        for (let page of Brain.specialComponentPages) {
            this.specialComponents[page] = new ComponentTree(
                `special:${page}`,
                await Bun.file(`${this.siteDataPath}/special/${page}.html`).text(),
            );

            let res = this.specialComponents[page].init();
            if (res.isErr()) {
                console.error(`Failed to load error page: ${res.unwrapErr()}`);
            }
        }

        console.info(
            `Loaded ${Object.keys(this.components).length} components, ${Object.keys(this.routes).length} routes, and ${Object.keys(this.staticFiles).length} static files.`,
        );
        console.debug(`Loaded components:\n  - ${Object.keys(this.components).join("\n  - ")}`);
        console.debug(`Loaded routes:\n  - ${Object.keys(this.routes).join("\n  - ")}`);
        console.debug(`Loaded static files:\n  - ${Object.keys(this.staticFiles).join("\n  - ")}`);
    }

    /**
     * Gets the config of Brain that it was initialised with.
     * @returns The Brain config that this class was initialisd with.
     */
    getConfig() {
        return this.config;
    }

    /**
     * Registers a component. Can be called manually, if you really want.
     * @param name The name of the component.
     * @param file The file containing the HTML data for this component.
     */
    async registerComponent(name: string, file: BunFile): Promise<Result<ComponentTree>> {
        let componentTree = new ComponentTree(name, await file.text());
        let res = componentTree.init();
        if (res.isErr()) {
            console.error(`Failed to load component ${name}, ${res.unwrapErr()}`);
        }

        this.components[name] = componentTree;
        return res.map(() => componentTree);
    }

    /**
     * Registers a route. Can be called manually, if you really want.
     * @param route The route that this file refers to, with the preceding slash.
     * @param file The file containing the HTML data for this route.
     */
    async registerRoute(route: string, file: BunFile): Promise<Result<ComponentTree>> {
        let componentTree = new ComponentTree(route, await file.text());
        let res = componentTree.init();
        if (res.isErr()) {
            console.error(`Failed to load component ${route}, ${res.unwrapErr()}`);
        }

        // still add it to routes even if it fails so it can show the "node tree is not initialised" error
        this.routes[route] = componentTree;
        return res.map(() => componentTree);
    }

    /**
     * Registers a static file. Can be called manually, and should be called manually for if static files update with
     * new data.
     * @param path The path that this file refers to, with the preceding slash.
     * @param file The file for this path.
     */
    async registerStaticFile(path: string, file: BunFile): Promise<Result> {
        if (!(await file.exists())) {
            return Result.err("file does not exist");
        }

        // this will replace the file if it already exists
        this.staticFiles[path] = file;
        return Result.ok();
    }

    /**
     * Registers a hook, which allows you to add HTML (or well, anything Bun allows) when Brain is rewriting the HTML.
     * Takes in the name of the element and a callback, in the same type that Bun's HTMLRewriter allows.
     * See https://bun.com/docs/runtime/html-rewriter.
     * TODO: Maybe allow removing hooks?
     *
     * @param element The name of the HTML element to call the callback on.
     * @param callback The callback to run on it.
     */
    registerHook(element: string, callback: HTMLRewriterTypes.HTMLRewriterElementContentHandlers) {
        this.hooks[element] = callback;
    }

    /**
     * Gets a component by name.
     * @param name The name of the component
     */
    getComponent(name: string): Result<ComponentTree> {
        return Result.fromNull(this.components[name], `component ${name} was not found`);
    }

    /**
     * Gets a route by the path.
     * @param path The path of the route
     */
    getRoute(path: string): Result<ComponentTree> {
        return Result.fromNull(this.routes[path], `route ${path} was not found`);
    }

    /**
     * Gets a static file by the path.
     * @param path The path of the file
     */
    getStaticFile(path: string): Result<BunFile> {
        return Result.fromNull(this.staticFiles[path], `static file ${path} was not found`);
    }

    /**
     * Generates a JS definition for a function that generates the component.
     * @param name The name of the component.
     * @returns The JS source as a function to generate that component if found, else an error.
     */
    generateClientJSForComponent(name: string): Result<string> {
        let component = this.components[name];
        if (!component) {
            return Result.err(`component ${name} was not found`);
        }

        return component.generateClientJS();
    }

    /**
     * Generates the HTML source for a component, with nothing else attached.
     * @param name The name of the component.
     * @param params The parameters to pass to generation.
     * @returns The HTML source of the component if found, else an error.
     */
    generateServerHTMLForComponent(name: string, params: ParameterMap): Result<string> {
        let component = this.components[name];
        if (!component) {
            return Result.err(`component ${name} was not found`);
        }

        return component.generateServerHTML(new GenerationContext(this, params));
    }

    /**
     * Generates the full HTML source for a route, which can be returned in a HTTP response. If the route is not found,
     * returns `Brain#generateErrorRoute` with the 404 error and the parameters fallen through.
     * @param route The route, without the trailing slash!
     * @param parameters The parameters to pass into components which need them.
     * @returns The HTML source for the route as a Bun Response, if found, else an error.
     */
    generatePage(route: string, parameters: ParameterMap = {}): Response {
        parameters = {
            ...parameters,
            "Brain.route": route,
        };

        let component = this.routes[route];
        if (!component) {
            let file = this.staticFiles[route];

            if (!file) {
                return this.generateErrorRoute(404, parameters);
            }

            return new Response(file, {
                headers: {
                    "Content-Type": file.type,
                },
            });
        }

        return new Response(this.generatePageFromComponent(component, parameters), {
            headers: {
                "Content-Type": "text/html",
            },
        });
    }

    /**
     * An internal function that may be called to skip generating a Response to get the raw HTML page string for a
     * component.
     * @param component The component to make the page with, should likely be a route component.
     * @param parameters The parameters to pass into components which need them.
     * @returns The raw HTML source for the route.
     */
    generatePageFromComponent(component: ComponentTree, parameters: ParameterMap): string {
        let html = component.generateServerHTML(new GenerationContext(this, parameters)).merge();
        let rewriter = new HTMLRewriter()
            .on("body", {
                element(body) {
                    body.append(html, { html: true });
                },
            })
            .on("head", {
                element: head => {
                    let res = component.getDependencies();
                    if (res.isErr()) {
                        head.append(
                            `
                                <div>Generating dependencies failed: ${res.unwrapErr()}</div>
                            `.trim(),
                            { html: true },
                        );

                        return;
                    }

                    let dependencies = res.unwrap();
                    if (dependencies.length == 0) {
                        return;
                    }

                    let sources = dependencies.map(dep =>
                        this.generateClientJSForComponent(dep).unwrapOrElse(
                            err => `// Failed to generate ${dep}: ${err}`,
                        ),
                    );

                    head.prepend(
                        `
                            <script blocking="render">
                                ${this.config.debug ? `// autogenerated from the following ${dependencies.length} dependencies: ${dependencies.join(", ")}` : ""}
                                ${sources.join("")}
                            </script>
                        `.trim(),
                        { html: true },
                    );
                },
            });

        for (let [element, callback] of Object.entries(this.hooks)) {
            rewriter.on(element, callback);
        }

        return rewriter.transform(this.specialRaws["skeleton"]);
    }

    /**
     * Generates the full HTML source for an error, using the special `error.html` page.
     * @param errorCode The error code as a number
     * @param parameters The parameters to pass to the page. Note that `Brain.errorCode` and `Brain.errorMessage` get
     *                   passed for you.
     * @returns The Response containing the error page.
     */
    generateErrorRoute(errorCode: number, parameters: ParameterMap = {}): Response {
        let errorMessage = errorMessageMap[errorCode]!;
        parameters["Brain.errorCode"] = errorCode.toString();
        parameters["Brain.errorMessage"] = errorMessage;

        let page = this.generatePageFromComponent(this.specialComponents["error"], parameters);
        return new Response(page, {
            headers: {
                "Content-Type": "text/html",
            },

            status: errorCode,
            statusText: errorMessage,
        });
    }
}
