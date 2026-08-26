import { Result } from "result-js";
import * as fs from "fs/promises";
import ComponentTree from "./ComponentTree";
import type { StringMap } from "./utils";
import { GenerationContext } from "./GenerationContext";

type SpecialRawTypes = "skeleton";
type SpecialComponentTypes = "error";

/**
 * The main Brain class. You should instantiate an instance of this class, passing in the path to the datas needed, then
 * call and await Brain#init, which will read the paths and files inside them. Then, in your server handler, call
 * Brain#generateRoute.
 *
 * The path you give to the constructor should have a file layout that looks like the following:
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
    private static specialRawPages = ["skeleton"];
    private static specialComponentPages = ["error"];

    private siteDataPath: string;

    private components: Record<string, ComponentTree>;
    private routes: Record<string, ComponentTree>;
    private specialRaws: Record<string, string>;
    private specialComponents: Record<string, ComponentTree>;

    constructor(siteDataPath: string) {
        this.siteDataPath = siteDataPath;

        this.components = {};
        this.routes = {};

        // @ts-ignore since we don't define each one explicitly
        this.specialRaws = {};

        // @ts-ignore
        this.specialComponents = {};
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
            let file = Bun.file(`${info.parentPath}/${info.name}`);

            let split = info.name.split(".");
            split.pop();
            let stem = split.join(".");

            let componentTree = new ComponentTree(stem, await file.text());
            let res = componentTree.init();
            if (res.isErr()) {
                console.error(`Failed to load component ${stem}, ${res.unwrapErr()}`);
            }

            this.components[stem] = componentTree;
        }

        // read routes (which are also technically components but with extra checks and parsing)
        for (let info of await fs.readdir(`${this.siteDataPath}/routes`, { withFileTypes: true, recursive: true })) {
            if (info.isDirectory()) continue;
            let file = Bun.file(`${info.parentPath}/${info.name}`);

            let path = info.parentPath.replace(`${this.siteDataPath}/routes`, "");
            let name = info.name == "index.html" ? "" : info.name;
            let route = `${path}/${name}`;
            if (route.endsWith("/") && route != "/") route = route.slice(0, -1);

            let componentTree = new ComponentTree("", await file.text());
            let res = componentTree.init();
            if (res.isErr()) {
                console.error(`Failed to load component ${route}, ${res.unwrapErr()}`);
            }

            // still add it to routes even if it fails so it can show the "node tree is not initialised" error
            this.routes[route] = componentTree;
        }

        // read special thingymabobs
        for (let page of Brain.specialRawPages) {
            this.specialRaws[page] = await Bun.file(`${this.siteDataPath}/special/${page}.html`).text();
        }

        for (let page of Brain.specialComponentPages) {
            this.specialComponents[page] = new ComponentTree(
                "",
                await Bun.file(`${this.siteDataPath}/special/${page}.html`).text(),
            );
            if (this.specialComponents[page].init().isErr()) {
                console.error("Failed to load error page: ");
            }
        }

        console.info(
            `Loaded ${Object.keys(this.components).length} components and ${Object.keys(this.routes).length} routes.`,
        );
        console.debug(`Loaded components: ${Object.keys(this.components).join(", ")}`);
        console.debug(`Loaded routes:\n  - ${Object.keys(this.routes).join("\n  - ")}`);
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
     * Generates the HTML source for a component.
     * @param name The name of the component.
     * @param params The parameters to pass to generation.
     * @returns The HTML source of the component if found, else an error.
     */
    generateServerHTMLForComponent(name: string, params: StringMap): Result<string> {
        let component = this.components[name];
        if (!component) {
            return Result.err(`component ${name} was not found`);
        }

        return component.generateServerHTML(new GenerationContext(this, params));
    }

    /**
     * Generates the full HTML source for a route.
     * @param route The route.
     * @param parameters The parameters to pass into components which need them.
     * @returns The HTML source for the route as a Bun Response, if found, else an error.
     */
    generateRoute(route: string, parameters: StringMap = {}): Response {
        let res = this.generateRouteInternal(route, parameters);
        if (res.unwrapErr()) {
        }
    }

    private generateRouteInternal(route: string, parameters: StringMap = {}): Result<Response> {
        let component = this.routes[route];
        if (!component) {
            let parameters: StringMap = {};
            parameters["Brain.errorCode"] = "404";
            parameters["Brain.errorMessage"] = "Not Found";
            let response = new Response(this.generatePageFromComponent(this.specialRaws["error"], parameters));
        }
    }

    private generatePageFromComponent(component: ComponentTree, parameters: StringMap): string {
        let html = component.generateServerHTML(new GenerationContext(this, parameters)).unwrapOrElse(err => err);
        let rewriter = new HTMLRewriter()
            .on("body", {
                element(body) {
                    body.append(html, { html: true });
                },
            })
            .on("head", {
                element: head => {
                    let dependencies = component.getDependencies().unwrapOr([]);
                    let sources = dependencies.map(dep =>
                        this.generateClientJSForComponent(dep).unwrapOrElse(
                            err => `// Failed to generate ${dep}: ${err}`,
                        ),
                    );
                    head.prepend(
                        `
                            <script blocking="render">
                                // autogenerated from the following ${dependencies.length} dependencies: ${dependencies.join(", ")}
                                ${sources.join("")}
                            </script>
                        `.trim(),
                        { html: true },
                    );
                },
            });

        return rewriter.transform(this.specialRaws["skeleton"]);
    }
}
