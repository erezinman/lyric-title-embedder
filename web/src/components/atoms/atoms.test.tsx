import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toggle, Chip } from "./index";
import { Icon } from "../icons/Icon";

describe("atoms", () => {
  it("Toggle reflects on state and fires onClick", async () => {
    const onClick = vi.fn();
    const { container } = render(<Toggle on={true} onClick={onClick} />);
    await userEvent.click(container.firstChild as Element);
    expect(onClick).toHaveBeenCalled();
  });
  it("Chip renders children and toggles class on `on`", () => {
    render(<Chip on>Glow</Chip>);
    expect(screen.getByText("Glow").className).toContain("on");
  });
  it("Icon renders an svg for a known name", () => {
    const { container } = render(<Icon name="play" size={16} />);
    expect(container.querySelector("svg")).toBeTruthy();
  });
});
