import { Result } from "result-js";
import * as fs from "fs/promises";
import ComponentTree from "./ComponentTree";
import type { StringMap } from "./utils";
import { GenerationContext } from "./GenerationContext";

type SpecialTypes = "skeleton";

/**
 * The main Brain class. You should instantiate an instance of this class, passing in the path to the datas needed, then
 * call and await Brain#init, which will read the paths and files inside them. Then, in your server handler, call
 * Brain#generateRoute.
 *
 * The path you give to the constructor should have a file layout that looks like the following:
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
 *         └── skeleton.html
 *
 * (passing "./my-site" from main.js)
 *
 * In the special/ directory, you must have the following files:
 *      - skeleton.html     Defines the "skeleton" of the website, the head and body tags. Brain will automatically
 *                          populate the head and body tags around what you provide in them, so you can leave the body
 *                          tag empty and it will be filled out by the contents of the route.
 *
 *
 * Note that internally, routes are also components.
 */
export class Brain {
    private siteDataPath: string;

    private components: Record<string, ComponentTree>;
    private routes: Record<string, ComponentTree>;
    private specials: Record<SpecialTypes, string>;

    constructor(siteDataPath: string) {
        this.siteDataPath = siteDataPath;

        this.components = {};
        this.routes = {};

        // @ts-ignore since we don't define "skeleton" explicitly
        this.specials = {};
    }

    /**
     * Initialises Brain, reads every component and every route, and reads the special files.
     */
    async init() {
        // read components
        for (let info of await fs.readdir(`${this.siteDataPath}/components`, { withFileTypes: true })) {
            if (info.isDirectory()) continue;
            let file = Bun.file(`${info.parentPath}/${info.name}`);

            let split = info.name.split(".");
            split.pop();
            let stem = split.join(".");

            this.components[stem] = new ComponentTree(stem, await file.text());
            let res = this.components[stem].init();
            if (res.isErr()) {
                console.error(`Failed to load component ${stem}, ${res.unwrapErr()}`);
            }
        }

        // read routes (which are also technically components but with extra checks and parsing)
        for (let info of await fs.readdir(`${this.siteDataPath}/routes`, { withFileTypes: true })) {
            if (info.isDirectory()) continue;
            let file = Bun.file(`${info.parentPath}/${info.name}`);

            let path = info.parentPath.replace(`${this.siteDataPath}/routes`, "");
            let name = info.name == "index.html" ? "" : info.name;
            let route = `${path}/${name}`;

            this.routes[route] = new ComponentTree("", await file.text());
            let res = this.routes[route].init();
            if (res.isErr()) {
                console.error(`Failed to load component ${route}, ${res.unwrapErr()}`);
            }
        }

        // read special thingymabobs
        this.specials["skeleton"] = await Bun.file(`${this.siteDataPath}/special/skeleton.html`).text();
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
    generateRoute(route: string, parameters: StringMap = {}): Result<Response> {
        let component = this.routes[route];
        if (!component) {
            return Result.err("404 Not Found");
        }

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

        let response = rewriter.transform(new Response(this.specials["skeleton"]));
        response.headers.set("Content-Type", "text/html");
        return Result.ok(response);
    }
}
