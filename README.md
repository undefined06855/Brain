# brain

Brain is a server or client-side component based HTML renderer.

Simply include the library in your (Bun) project and run
```ts
let myBrain = Brain("./my-site");
await myBrain.init();
```
and read the Brain doc-comment for more information.

This bundles zero anything ever, generates raw, plain HTML and raw JavaScript (if you want, to be able to make the
exact same components client-side as well as server-side)!

This project was created using `bun init` in bun v1.3.14. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
