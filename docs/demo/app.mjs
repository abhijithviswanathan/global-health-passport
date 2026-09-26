/** Composition root for the public presentation. No backend, storage or real accounts. */
import { DemoApplication } from "./ui/application.mjs";
const application = new DemoApplication(document);
application.start();
