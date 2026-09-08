import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("legacy React runtime", () => {
  it("keeps Dashboard reads, selection, and Project Master writes coherent", async () => {
    document.body.innerHTML = '<div id="root"></div>';

    await act(async () => {
      await import("../../main");
    });

    expect(screen.getByRole("heading", { name: "Project Information" })).toBeInTheDocument();
    expect(screen.getByText("Manta_16")).toBeInTheDocument();
    expect(screen.getByText("Orca_14")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Orca_14" } });

    expect(screen.getByText("Orca_14")).toBeInTheDocument();
    expect(screen.queryByText("Manta_16")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Product Line"), { target: { value: "Deep Sea" } });

    expect(screen.getByText("BlueWhale_18")).toBeInTheDocument();
    expect(screen.queryByText("Orca_14")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Product Line"), { target: { value: "" } });
    fireEvent.click(screen.getByText("Orca_14"));

    const projectHeader = screen.getByRole("region", { name: "Project Header" });

    expect(within(projectHeader).getByRole("heading", { name: "Project Master" })).toBeInTheDocument();
    expect(within(projectHeader).getByText("Project Name: Orca_14")).toBeInTheDocument();
    expect(within(projectHeader).getByText("QCI Model Name: OR14-P")).toBeInTheDocument();
    expect(within(projectHeader).getByText("Acer Model Name: Orca-P14")).toBeInTheDocument();

    fireEvent.click(within(projectHeader).getByRole("button", { name: "Edit Project" }));
    fireEvent.change(screen.getByLabelText("Project Name"), { target: { value: "Orca_14 Revised" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(within(projectHeader).getByText("Project Name: Orca_14 Revised")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to Dashboard" }));

    expect(screen.getByText("Orca_14 Revised")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Year" }), { target: { value: "2029" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Customer" }), {
      target: { value: "Characterization Customer" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Product Line" }), {
      target: { value: "Characterization Line" },
    });
    fireEvent.change(screen.getByLabelText("Project Name"), { target: { value: "Characterized Project" } });
    fireEvent.change(screen.getByLabelText("QCI Model Name"), { target: { value: "CHAR-QCI" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Characterized Project")).toBeInTheDocument();
    expect(screen.getByText("CHAR-QCI")).toBeInTheDocument();
  }, 15_000);
});
