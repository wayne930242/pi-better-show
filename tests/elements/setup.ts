import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Frames are never loaded: the tests assert what an element puts in the DOM, not what a page inside it does.
GlobalRegistrator.register({ url: "http://localhost/", settings: { disableIframePageLoading: true } });
