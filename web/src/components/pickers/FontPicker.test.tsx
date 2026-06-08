// FontPicker.test.tsx — behavior of the ported font picker.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { stubLocalStorage } from "../../test-util/storage";

// Mock the daemon font API at the client boundary.
const upload = vi.fn((..._a: unknown[]) => Promise.resolve({ family: "Acme", url: "/api/fonts/file/Acme" }));
const remove = vi.fn((..._a: unknown[]) => Promise.resolve({ deleted: true }));
vi.mock("../../api/client", () => ({
  fonts: { upload: (...a: unknown[]) => upload(...a), remove: (...a: unknown[]) => remove(...a), list: vi.fn() },
}));

// jsdom has no FontFace; stub a resolving one and a document.fonts.add sink.
class FakeFontFace {
  constructor(public family: string, public src: string) {}
  load() { return Promise.resolve(this as unknown as FontFace); }
}

let added: FontFace[];
beforeEach(() => {
  stubLocalStorage();
  added = [];
  vi.stubGlobal("FontFace", FakeFontFace as unknown as typeof FontFace);
  if (!(document as Document & { fonts?: unknown }).fonts) {
    Object.defineProperty(document, "fonts", { configurable: true, value: { add: (f: FontFace) => added.push(f) } });
  } else {
    vi.spyOn(document.fonts, "add").mockImplementation((f) => { added.push(f as FontFace); return document.fonts; });
  }
  upload.mockClear();
  remove.mockClear();
});
afterEach(() => { vi.unstubAllGlobals(); });

// Import AFTER mocks/stubs so the module-level store + FontFace pick them up.
let FontPicker: typeof import("./FontPicker").FontPicker;
let kspFontStore: typeof import("./FontPicker").kspFontStore;
beforeEach(async () => {
  vi.resetModules();
  const mod = await import("./FontPicker");
  FontPicker = mod.FontPicker;
  kspFontStore = mod.kspFontStore;
});

describe("FontPicker — list & search", () => {
  it("renders the curated font list", () => {
    render(<FontPicker value="Anton" onChange={vi.fn()} />);
    expect(screen.getByText("Space Grotesk")).toBeTruthy();
    expect(screen.getByText("Oswald")).toBeTruthy();
  });
  it("search filters the list case-insensitively", async () => {
    render(<FontPicker value="Anton" onChange={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText("Search fonts"), "oswa");
    expect(screen.getByText("Oswald")).toBeTruthy();
    expect(screen.queryByText("Space Grotesk")).toBeNull();
  });
  it("clicking a row fires onChange(family)", async () => {
    const onChange = vi.fn();
    render(<FontPicker value="Anton" onChange={onChange} />);
    await userEvent.click(screen.getByText("Montserrat"));
    expect(onChange).toHaveBeenCalledWith("Montserrat");
  });
});

describe("FontPicker — B/I/U toggles", () => {
  it("shows toggles only when onTypo is provided, with aria-pressed reflecting state", () => {
    const { rerender } = render(<FontPicker value="Anton" onChange={vi.fn()} />);
    expect(screen.queryByRole("group", { name: /Type style/i })).toBeNull();
    rerender(<FontPicker value="Anton" onChange={vi.fn()} onTypo={vi.fn()} bold italic={false} underline={false} />);
    const grp = screen.getByRole("group", { name: /Type style/i });
    expect(within(grp).getByTitle("Bold").getAttribute("aria-pressed")).toBe("true");
    expect(within(grp).getByTitle("Italic").getAttribute("aria-pressed")).toBe("false");
  });
  it("clicking Italic dispatches onTypo('italic', true)", async () => {
    const onTypo = vi.fn();
    render(<FontPicker value="Anton" onChange={vi.fn()} onTypo={onTypo} italic={false} />);
    await userEvent.click(screen.getByTitle("Italic"));
    expect(onTypo).toHaveBeenCalledWith("italic", true);
  });
  it("clicking an on toggle dispatches the inverse", async () => {
    const onTypo = vi.fn();
    render(<FontPicker value="Anton" onChange={vi.fn()} onTypo={onTypo} underline />);
    await userEvent.click(screen.getByTitle("Underline"));
    expect(onTypo).toHaveBeenCalledWith("underline", false);
  });
});

describe("FontPicker — custom-font upload", () => {
  function mkFile() { return new File([new Uint8Array([1, 2, 3])], "My_Face.ttf", { type: "font/ttf" }); }

  it("registers a FontFace, posts to the daemon, selects + adds the row", async () => {
    const onChange = vi.fn();
    const { container } = render(<FontPicker value="Anton" onChange={onChange} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [mkFile()] } });

    // FileReader + FontFace.load resolve async; family derived "My Face".
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("My Face"));
    expect(added.length).toBeGreaterThan(0);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect((upload.mock.calls[0] as unknown[])[1]).toBe("My Face");
    // row added with a remove (×) control
    await waitFor(() => expect(screen.getByText("My Face")).toBeTruthy());
  });

  it("shows the burn hint only when the daemon upload fails", async () => {
    upload.mockImplementationOnce(() => Promise.reject(new Error("no fontsdir")));
    const { container } = render(<FontPicker value="Anton" onChange={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [mkFile()] } });
    await waitFor(() => expect(screen.getByText(/install on render host to burn/i)).toBeTruthy());
  });

  it("hides the burn hint on successful daemon persistence", async () => {
    const { container } = render(<FontPicker value="Anton" onChange={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [mkFile()] } });
    await waitFor(() => expect(upload).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/install on render host/i)).toBeNull());
  });

  it("removing a custom row calls kspFontStore.remove + DELETE on the daemon", async () => {
    kspFontStore.add("Acme", "data:font/ttf;base64,AAAA");
    render(<FontPicker value="Anton" onChange={vi.fn()} />);
    const row = screen.getByText("Acme").closest(".ksp-fitem") as HTMLElement;
    fireEvent.click(within(row).getByTitle("Remove custom font"));
    expect(remove).toHaveBeenCalledWith("Acme");
    await waitFor(() => expect(screen.queryByText("Acme")).toBeNull());
  });

  it("hides upload when allowUpload=false", () => {
    render(<FontPicker value="Anton" onChange={vi.fn()} allowUpload={false} />);
    expect(screen.queryByText(/Upload custom font/i)).toBeNull();
  });
});

describe("FontPicker — field mode", () => {
  it("renders a trigger and opens/closes a popover", async () => {
    const { container } = render(<FontPicker mode="field" value="Anton" onChange={vi.fn()} />);
    const trigger = container.querySelector(".ksp-field") as HTMLElement;
    expect(container.querySelector(".ksp-pop")).toBeNull();
    await userEvent.click(trigger);
    expect(container.querySelector(".ksp-pop")).not.toBeNull();
    fireEvent.click(container.querySelector(".ksp-backdrop") as HTMLElement);
    expect(container.querySelector(".ksp-pop")).toBeNull();
  });
});
