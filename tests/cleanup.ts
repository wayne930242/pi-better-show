import { afterAll } from "bun:test";
import { removeTrees } from "./extension/helpers.ts";

// A hook in a preload runs once after every test file, so the scratch trees of all of them go.
afterAll(removeTrees);
