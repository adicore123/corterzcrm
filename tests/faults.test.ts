import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";

test("fault guides support CRUD, duplicate guard, model rename cascade, search, and Range video streaming", async () => {
  const root = await mkdtemp(join(tmpdir(), "cortez-faults-"));
  process.env.CORTEZ_STORAGE_DIR = root;
  delete process.env.CORTEZ_STORAGE_BACKEND;
  try {
    const { writeCollection } = await import("../src/lib/json-db/store");
    const { deleteRecord, getRecord, saveRecord } = await import("../src/lib/json-db/records");
    const { searchRecords } = await import("../src/lib/json-db/queries");
    const { saveLocalAttachmentFile, serveAttachmentResponse } = await import("../src/lib/uploads/attachments");
    const { embedVideoUrl } = await import("../src/lib/presentation");

    assert.equal(embedVideoUrl("https://youtu.be/abc123XYZ"), "https://www.youtube-nocookie.com/embed/abc123XYZ");
    assert.equal(embedVideoUrl("https://www.youtube.com/shorts/short99"), "https://www.youtube-nocookie.com/embed/short99");
    assert.equal(embedVideoUrl("https://drive.google.com/file/d/FILE_ID_1/view?usp=sharing"), "https://drive.google.com/file/d/FILE_ID_1/preview");
    assert.equal(embedVideoUrl("https://example.com/plain.mp4"), null);

    const admin = {
      id: "11111111-1111-4111-8111-111111111111",
      username: "admin",
      name: "Admin",
      role: "admin" as const,
      disabled: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await writeCollection("users", [{
      ...admin,
      passwordHash: "0".repeat(32) + ":" + "0".repeat(128),
    }]);

    // Stage local PDF and MP4 attachments
    const pdfId = randomUUID();
    const videoId = randomUUID();
    const pdfBytes = Buffer.from("%PDF-1.4\n1 0 obj <<>> endobj\n%%EOF\n");
    const videoBytes = Buffer.from("00000018ftypmp4200000000mp42isom_fake_video_payload_1234567890");
    await saveLocalAttachmentFile(pdfId, new File([pdfBytes], "codes-10x.pdf", { type: "application/pdf" }), "file");
    await saveLocalAttachmentFile(videoId, new File([videoBytes], "unlock-10x.mp4", { type: "video/mp4" }), "video");

    const created = await saveRecord("faults", undefined, {
      device: "קורקינט חשמלי",
      model: "CORTEZ 10X",
      summary: "בקר 36V צג עגול",
      unlockInstructions: "לחיצה על + ו- וכניסה ל-P08",
      commonFaults: [{
        id: randomUUID(),
        code: "E07",
        title: "תקלת חיישן בלם",
        symptoms: "הכלי לא מאיץ ומופיע סמל בלם",
        solution: "בדיקת מחבר ידית בלם שמאלית והחלפת חיישן",
        severity: "נפוצה",
      }],
      videoLinks: [{ id: randomUUID(), title: "פתיחת הגבלה יוטיוב", url: "https://youtu.be/abc123XYZ" }],
      notes: "דגם נפוץ במעבדה",
      stagedAttachments: [
        { id: pdfId, name: "codes-10x.pdf", kind: "file", type: "application/pdf" },
        { id: videoId, name: "unlock-10x.mp4", kind: "video", type: "video/mp4" },
      ],
    }, [], admin);

    assert.ok("commonFaults" in created);
    assert.equal(created.attachments.length, 2);

    // Duplicate model guide is blocked with 409
    await assert.rejects(() => saveRecord("faults", undefined, {
      device: "קורקינט חשמלי",
      model: "cortez 10x",
      summary: "",
      unlockInstructions: "",
      commonFaults: [],
      videoLinks: [],
      notes: "",
    }, [], admin), { status: 409 });

    // Search by error code, filename, and filter by video/files
    assert.equal((await searchRecords("faults", { q: "E07" })).length, 1);
    assert.equal((await searchRecords("faults", { q: "codes-10x.pdf" })).length, 1);
    assert.equal((await searchRecords("faults", { status: "has-video" })).length, 1);
    assert.equal((await searchRecords("faults", { status: "has-files" })).length, 1);
    assert.equal((await searchRecords("faults", { status: "אופניים חשמליים" })).length, 0);

    // Range streaming for video returns 206 Partial Content
    const videoAttachment = created.attachments.find((item) => item.kind === "video")!;
    const rangeRes = await serveAttachmentResponse(
      videoAttachment,
      new NextRequest("http://127.0.0.1/api/files/faults/" + created.id + "/" + videoAttachment.id, { headers: { range: "bytes=0-15" } }),
      false,
    );
    assert.equal(rangeRes.status, 206);
    assert.equal(rangeRes.headers.get("content-range"), `bytes 0-15/${videoBytes.length}`);
    assert.equal((await rangeRes.arrayBuffer()).byteLength, 16);

    // Renaming the model in `models` cascades to `faults`
    const modelRecord = await getRecord("models", "00000000-0000-4000-8000-000000000001");
    await saveRecord("models", modelRecord.id, {
      device: modelRecord.device,
      name: "CORTEZ 10X RENAMED",
      notes: modelRecord.notes,
      version: modelRecord.updatedAt,
    }, [], admin);
    const cascaded = await getRecord("faults", created.id);
    assert.equal(cascaded.model, "CORTEZ 10X RENAMED");

    // Delete removes guide and its attachments cleanly
    await deleteRecord("faults", cascaded.id, cascaded.updatedAt, admin);
    await assert.rejects(() => getRecord("faults", cascaded.id), { status: 404 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
