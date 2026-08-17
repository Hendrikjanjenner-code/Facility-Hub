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
  addPendingUpload,
  clearPendingUpload,
  pendingUploadEntryKey,
} from "@/lib/pending-upload-helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BUILDING_ID = 42;
const OBJECT_PATH = "/objects/uploads/test-file.pdf";
const OBJECT_PATH_2 = "/objects/uploads/second-file.pdf";

const PENDING_ENTRY = {
  objectPath: OBJECT_PATH,
  contentType: "application/pdf",
  sizeBytes: 1024,
  title: "Testdocument",
  category: "overig",
} as const;

const PENDING_ENTRY_2 = {
  objectPath: OBJECT_PATH_2,
  contentType: "application/pdf",
  sizeBytes: 2048,
  title: "Tweede document",
  category: "bouwtekening",
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

  it("addPendingUpload writes the entry to its own localStorage key", () => {
    addPendingUpload(BUILDING_ID, PENDING_ENTRY);

    const key = pendingUploadEntryKey(BUILDING_ID, OBJECT_PATH);
    const raw = localStorage.getItem(key);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed).toMatchObject({
      objectPath: OBJECT_PATH,
      title: "Testdocument",
      category: "overig",
    });
  });

  // ── 2. Two concurrent uploads get independent keys (no overwrite) ───────

  it("two uploads for the same building get independent keys and neither overwrites the other", () => {
    addPendingUpload(BUILDING_ID, PENDING_ENTRY);
    addPendingUpload(BUILDING_ID, PENDING_ENTRY_2);

    const key1 = pendingUploadEntryKey(BUILDING_ID, OBJECT_PATH);
    const key2 = pendingUploadEntryKey(BUILDING_ID, OBJECT_PATH_2);

    expect(key1).not.toBe(key2);
    expect(localStorage.getItem(key1)).not.toBeNull();
    expect(localStorage.getItem(key2)).not.toBeNull();
  });

  // ── 3. Banner is NOT shown when there is no pending entry ───────────────

  it("renders nothing when localStorage has no pending entry", () => {
    const { container } = renderBanner([]);
    expect(container).toBeEmptyDOMElement();
  });

  // ── 4. Banner IS shown when objectPath is absent from the document list ─

  it("shows the recovery banner when the pending objectPath is not in documents", async () => {
    addPendingUpload(BUILDING_ID, PENDING_ENTRY);

    renderBanner([]); // empty document list → path not saved yet

    await waitFor(() => {
      expect(
        screen.getByTestId("pending-upload-banner"),
      ).toBeInTheDocument();
    });

    expect(screen.getByText(/Testdocument/)).toBeInTheDocument();
  });

  // ── 5. Two orphaned uploads produce two banners ─────────────────────────

  it("shows two banners when two pending uploads exist", async () => {
    addPendingUpload(BUILDING_ID, PENDING_ENTRY);
    addPendingUpload(BUILDING_ID, PENDING_ENTRY_2);

    renderBanner([]);

    await waitFor(() => {
      const banners = screen.getAllByTestId("pending-upload-banner");
      expect(banners).toHaveLength(2);
    });
  });

  // ── 6. Banner is hidden when objectPath already appears in documents ────

  it("does NOT show the banner when the objectPath is already registered", async () => {
    addPendingUpload(BUILDING_ID, PENDING_ENTRY);

    // Simulate the document having been persisted (e.g. saved from another tab)
    renderBanner([{ objectPath: OBJECT_PATH }]);

    // Give the effect time to run
    await new Promise((r) => setTimeout(r, 50));

    expect(
      screen.queryByTestId("pending-upload-banner"),
    ).not.toBeInTheDocument();
  });

  // ── 7. Dismissing one banner leaves the other intact ────────────────────

  it("clearing one entry does not affect other pending uploads", () => {
    addPendingUpload(BUILDING_ID, PENDING_ENTRY);
    addPendingUpload(BUILDING_ID, PENDING_ENTRY_2);

    clearPendingUpload(BUILDING_ID, OBJECT_PATH);

    expect(localStorage.getItem(pendingUploadEntryKey(BUILDING_ID, OBJECT_PATH))).toBeNull();
    expect(localStorage.getItem(pendingUploadEntryKey(BUILDING_ID, OBJECT_PATH_2))).not.toBeNull();
  });

  // ── 8. Clicking "Opnieuw proberen" reveals the retry form ───────────────

  it("reveals the retry form when the user clicks Opnieuw proberen", async () => {
    const user = userEvent.setup();
    addPendingUpload(BUILDING_ID, PENDING_ENTRY);
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

  // ── 9. "Alsnog opslaan" calls createBuildingDocument with correct args ──

  it("calls createBuildingDocument with the pending entry data on retry", async () => {
    const user = userEvent.setup();

    // Simulate success: invoke onSuccess and onSettled callbacks
    mockMutate.mockImplementation((_args: unknown, callbacks: { onSuccess?: () => void; onSettled?: () => void }) => {
      callbacks?.onSuccess?.();
      callbacks?.onSettled?.();
    });

    addPendingUpload(BUILDING_ID, PENDING_ENTRY);
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

  // ── 10. localStorage is cleared after a successful retry ─────────────────

  it("clears localStorage when createBuildingDocument succeeds", async () => {
    const user = userEvent.setup();

    mockMutate.mockImplementation((_args: unknown, callbacks: { onSuccess?: () => void; onSettled?: () => void }) => {
      callbacks?.onSuccess?.();
      callbacks?.onSettled?.();
    });

    addPendingUpload(BUILDING_ID, PENDING_ENTRY);
    renderBanner([]);

    await waitFor(() =>
      expect(screen.getByTestId("pending-upload-banner")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /opnieuw proberen/i }));
    await user.click(screen.getByRole("button", { name: /alsnog opslaan/i }));

    await waitFor(() => {
      expect(
        localStorage.getItem(pendingUploadEntryKey(BUILDING_ID, OBJECT_PATH)),
      ).toBeNull();
    });
  });

  // ── 11. Banner disappears from the DOM after a successful retry ──────────

  it("hides the banner after a successful retry save", async () => {
    const user = userEvent.setup();

    mockMutate.mockImplementation((_args: unknown, callbacks: { onSuccess?: () => void; onSettled?: () => void }) => {
      callbacks?.onSuccess?.();
      callbacks?.onSettled?.();
    });

    addPendingUpload(BUILDING_ID, PENDING_ENTRY);
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

  // ── 12. localStorage survives when createBuildingDocument fails ──────────

  it("keeps the localStorage entry when the retry save fails", async () => {
    const user = userEvent.setup();

    mockMutate.mockImplementation((_args: unknown, callbacks: { onError?: () => void; onSettled?: () => void }) => {
      callbacks?.onError?.();
      callbacks?.onSettled?.();
    });

    addPendingUpload(BUILDING_ID, PENDING_ENTRY);
    renderBanner([]);

    await waitFor(() =>
      expect(screen.getByTestId("pending-upload-banner")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /opnieuw proberen/i }));
    await user.click(screen.getByRole("button", { name: /alsnog opslaan/i }));

    await waitFor(() => expect(mockMutate).toHaveBeenCalledOnce());

    // Entry must still be in localStorage so the banner can reappear on reload
    expect(
      localStorage.getItem(pendingUploadEntryKey(BUILDING_ID, OBJECT_PATH)),
    ).not.toBeNull();
  });

  // ── 13. clearPendingUpload removes the correct localStorage key ──────────

  it("clearPendingUpload removes only the target entry from localStorage", () => {
    addPendingUpload(BUILDING_ID, PENDING_ENTRY);
    expect(
      localStorage.getItem(pendingUploadEntryKey(BUILDING_ID, OBJECT_PATH)),
    ).not.toBeNull();

    clearPendingUpload(BUILDING_ID, OBJECT_PATH);
    expect(
      localStorage.getItem(pendingUploadEntryKey(BUILDING_ID, OBJECT_PATH)),
    ).toBeNull();
  });
});
