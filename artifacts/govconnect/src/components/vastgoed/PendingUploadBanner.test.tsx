import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks – must be hoisted before any import that pulls in the real modules
// ---------------------------------------------------------------------------

const mockMutate = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useCreateBuildingDocument: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
  getListBuildingDocumentsQueryKey: (id: number) => ["buildings", id, "documents"],
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

// ---------------------------------------------------------------------------
// Subject under test (imported after mocks)
// ---------------------------------------------------------------------------

import { PendingUploadBanner } from "./PendingUploadBanner";
import {
  setPendingUpload,
  clearPendingUpload,
  pendingUploadKey,
} from "@/lib/pending-upload-helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BUILDING_ID = 42;
const OBJECT_PATH = "/objects/uploads/test-file.pdf";

const PENDING_ENTRY = {
  objectPath: OBJECT_PATH,
  contentType: "application/pdf",
  sizeBytes: 1024,
  title: "Testdocument",
  category: "overig",
} as const;

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={makeQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

function renderBanner(
  documents: Array<{ objectPath: string }> = [],
  buildingId = BUILDING_ID,
) {
  return render(
    <PendingUploadBanner buildingId={buildingId} documents={documents} />,
    { wrapper: Wrapper },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PendingUploadBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ── 1. localStorage entry is written after a successful storage upload ──

  it("setPendingUpload writes the entry to localStorage", () => {
    setPendingUpload(BUILDING_ID, PENDING_ENTRY);

    const raw = localStorage.getItem(pendingUploadKey(BUILDING_ID));
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed).toMatchObject({
      objectPath: OBJECT_PATH,
      title: "Testdocument",
      category: "overig",
    });
  });

  // ── 2. Banner is NOT shown when there is no pending entry ───────────────

  it("renders nothing when localStorage has no pending entry", () => {
    const { container } = renderBanner([]);
    expect(container).toBeEmptyDOMElement();
  });

  // ── 3. Banner IS shown when objectPath is absent from the document list ─

  it("shows the recovery banner when the pending objectPath is not in documents", async () => {
    setPendingUpload(BUILDING_ID, PENDING_ENTRY);

    renderBanner([]); // empty document list → path not saved yet

    await waitFor(() => {
      expect(
        screen.getByTestId("pending-upload-banner"),
      ).toBeInTheDocument();
    });

    expect(screen.getByText(/Testdocument/)).toBeInTheDocument();
  });

  // ── 4. Banner is hidden when objectPath already appears in documents ────

  it("does NOT show the banner when the objectPath is already registered", async () => {
    setPendingUpload(BUILDING_ID, PENDING_ENTRY);

    // Simulate the document having been persisted (e.g. saved from another tab)
    renderBanner([{ objectPath: OBJECT_PATH }]);

    // Give the effect time to run
    await new Promise((r) => setTimeout(r, 50));

    expect(
      screen.queryByTestId("pending-upload-banner"),
    ).not.toBeInTheDocument();
  });

  // ── 5. Clicking "Opnieuw proberen" reveals the retry form ───────────────

  it("reveals the retry form when the user clicks Opnieuw proberen", async () => {
    const user = userEvent.setup();
    setPendingUpload(BUILDING_ID, PENDING_ENTRY);
    renderBanner([]);

    await waitFor(() =>
      expect(screen.getByTestId("pending-upload-banner")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /opnieuw proberen/i }));

    expect(screen.getByLabelText(/titel/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /alsnog opslaan/i }),
    ).toBeInTheDocument();
  });

  // ── 6. "Alsnog opslaan" calls createBuildingDocument with correct args ──

  it("calls createBuildingDocument with the pending entry data on retry", async () => {
    const user = userEvent.setup();

    // Simulate success: invoke onSuccess and onSettled callbacks
    mockMutate.mockImplementation((_args: unknown, callbacks: { onSuccess?: () => void; onSettled?: () => void }) => {
      callbacks?.onSuccess?.();
      callbacks?.onSettled?.();
    });

    setPendingUpload(BUILDING_ID, PENDING_ENTRY);
    renderBanner([]);

    await waitFor(() =>
      expect(screen.getByTestId("pending-upload-banner")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /opnieuw proberen/i }));
    await user.click(screen.getByRole("button", { name: /alsnog opslaan/i }));

    expect(mockMutate).toHaveBeenCalledOnce();
    const [mutateArgs] = mockMutate.mock.calls[0] as [{ id: number; data: Record<string, unknown> }, unknown];
    expect(mutateArgs.id).toBe(BUILDING_ID);
    expect(mutateArgs.data.objectPath).toBe(OBJECT_PATH);
    expect(mutateArgs.data.title).toBe("Testdocument");
    expect(mutateArgs.data.category).toBe("overig");
  });

  // ── 7. localStorage is cleared after a successful retry ─────────────────

  it("clears localStorage when createBuildingDocument succeeds", async () => {
    const user = userEvent.setup();

    mockMutate.mockImplementation((_args: unknown, callbacks: { onSuccess?: () => void; onSettled?: () => void }) => {
      callbacks?.onSuccess?.();
      callbacks?.onSettled?.();
    });

    setPendingUpload(BUILDING_ID, PENDING_ENTRY);
    renderBanner([]);

    await waitFor(() =>
      expect(screen.getByTestId("pending-upload-banner")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /opnieuw proberen/i }));
    await user.click(screen.getByRole("button", { name: /alsnog opslaan/i }));

    await waitFor(() => {
      expect(localStorage.getItem(pendingUploadKey(BUILDING_ID))).toBeNull();
    });
  });

  // ── 8. Banner disappears from the DOM after a successful retry ──────────

  it("hides the banner after a successful retry save", async () => {
    const user = userEvent.setup();

    mockMutate.mockImplementation((_args: unknown, callbacks: { onSuccess?: () => void; onSettled?: () => void }) => {
      callbacks?.onSuccess?.();
      callbacks?.onSettled?.();
    });

    setPendingUpload(BUILDING_ID, PENDING_ENTRY);
    renderBanner([]);

    await waitFor(() =>
      expect(screen.getByTestId("pending-upload-banner")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /opnieuw proberen/i }));
    await user.click(screen.getByRole("button", { name: /alsnog opslaan/i }));

    await waitFor(() => {
      expect(
        screen.queryByTestId("pending-upload-banner"),
      ).not.toBeInTheDocument();
    });
  });

  // ── 9. localStorage survives when createBuildingDocument fails ──────────

  it("keeps the localStorage entry when the retry save fails", async () => {
    const user = userEvent.setup();

    mockMutate.mockImplementation((_args: unknown, callbacks: { onError?: () => void; onSettled?: () => void }) => {
      callbacks?.onError?.();
      callbacks?.onSettled?.();
    });

    setPendingUpload(BUILDING_ID, PENDING_ENTRY);
    renderBanner([]);

    await waitFor(() =>
      expect(screen.getByTestId("pending-upload-banner")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /opnieuw proberen/i }));
    await user.click(screen.getByRole("button", { name: /alsnog opslaan/i }));

    await waitFor(() => expect(mockMutate).toHaveBeenCalledOnce());

    // Entry must still be in localStorage so the banner can reappear on reload
    expect(localStorage.getItem(pendingUploadKey(BUILDING_ID))).not.toBeNull();
  });

  // ── 10. clearPendingUpload removes the localStorage key ─────────────────

  it("clearPendingUpload removes the entry from localStorage", () => {
    setPendingUpload(BUILDING_ID, PENDING_ENTRY);
    expect(localStorage.getItem(pendingUploadKey(BUILDING_ID))).not.toBeNull();

    clearPendingUpload(BUILDING_ID);
    expect(localStorage.getItem(pendingUploadKey(BUILDING_ID))).toBeNull();
  });
});
