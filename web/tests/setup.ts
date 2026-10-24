// jsdom has no canvas; the interface tests only need getContext to return nothing.
HTMLCanvasElement.prototype.getContext = (() => null) as never;
