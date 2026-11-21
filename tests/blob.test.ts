import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { put } from "@vercel/blob/client";
import sharp from "sharp";
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { createUser, getUser, login } from "../src/lib/auth/session";
import { deleteRecord, getRecord, saveRecord } from "../src/lib/json-db/records";
import { createBackup, listBackups } from "../src/lib/json-db/store";
import { authorizeUpload, prepareBlobPhotos, readBlobPhoto } from "../src/lib/uploads/blob-images";

test("Blob SDK creates a private record and image, and a backup retains that image", async () => {
  const files = new Map<string, { body: Buffer; type: string; etag: string }>();
  const fakeToken = "vercel_blob_rw_testfixture_notarealtoken";
  let sequence = 0;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const key = url.searchParams.get("pathname") ?? "";
    const error = (status: number, code: string) => {
      res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify({ error: { code, message: code } }));
    };
    if (req.method === "PUT" && req.headers["x-vercel-blob-access"] === "private") {
      const body: Buffer[] = [];
      for await (const part of req) body.push(Buffer.from(part));
      const existing = files.get(key);
      const match = req.headers["x-if-match"];
      if (match && existing?.etag !== match) return error(412, "precondition_failed");
      if (existing && !match) return error(400, "bad_request");
      const etag = '"' + String(++sequence) + '"';
      const type = String(req.headers["x-content-type"] ?? req.headers["content-type"] ?? "application/octet-stream");
      const target = "https://testfixture.private.blob.vercel-storage.com/" + key;
      files.set(key, { body: Buffer.concat(body), type, etag });
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ pathname: key, url: target, downloadUrl: target + "?download=1", contentType: type, etag }));
    }
    if (req.method === "GET" && req.headers.authorization === "Bearer " + fakeToken) {
      const prefix = url.searchParams.get("prefix") ?? "";
      const blobs = Array.from(files.keys()).filter((name) => name.startsWith(prefix)).map((pathname) => ({ pathname }));
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ blobs, hasMore: false }));
    }
    error(403, "forbidden");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  process.env.VERCEL_BLOB_API_URL = "http://127.0.0.1:" + address.port;
  process.env.BLOB_READ_WRITE_TOKEN = fakeToken;
  process.env.CORTEZ_STORAGE_BACKEND = "blob";

  // Initialize Node's built-in Web APIs before installing the SDK transport mock.
  await new Response("test").text();
  const dispatcher = getGlobalDispatcher();
  const mock = new MockAgent();
  mock.disableNetConnect();
  mock.enableNetConnect("127.0.0.1:" + address.port);
  const privateOrigin = mock.get("https://testfixture.private.blob.vercel-storage.com");
  const authorization = "Bearer " + fakeToken;
  function reply({ path }: { path: string }) {
      const url = new URL(path, "https://testfixture.private.blob.vercel-storage.com");
      const key = decodeURIComponent(url.pathname.slice(1));
      if (key.endsWith("state.json")) assert.equal(url.searchParams.get("cache"), "0");
      const file = files.get(key);
      return file ? {
        statusCode: 200,
        data: file.body,
        responseOptions: { headers: { "Content-Length": String(file.body.length), "Content-Type": file.type, ETag: file.etag } },
      } : { statusCode: 404 };
  }
  privateOrigin.intercept({ path: /^\/cortez\/v1\/state\.json\?cache=0$/, method: "GET",
    headers: { authorization, "accept-encoding": "identity" } }).reply(reply).persist();
  privateOrigin.intercept({ path: /^\/cortez\/v1\/(incoming|photos)\//, method: "GET",
    headers: { authorization } }).reply(reply).persist();
  setGlobalDispatcher(mock);

  try {
    const password = randomUUID();
    const admin = await createUser({ role: "admin", username: "blob-admin", name: "מנהל בדיקה", password });
    const employee = await createUser({ role: "employee", username: "blob-employee", name: "עובד בדיקה", password }, admin);
    const session = await login(admin.username, password);
    assert.equal((await getUser(session.token))?.id, admin.id);
    const id = randomUUID();
    const grant = await authorizeUpload("standards", admin.id, id);
    const fixture = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#a91417" } }).jpeg().toBuffer();
    await put(grant.pathname, new File([new Uint8Array(fixture)], "device.jpg", { type: "image/jpeg" }), { access: "private", token: grant.token });
    const stagedPhotos = [{ id, name: "device.jpg" }];
    await assert.rejects(() => prepareBlobPhotos("standards", employee.id, stagedPhotos), { status: 400 });
    const input = {
      number: "TEST-1", requestId: randomUUID(), device: "קורקינט חשמלי", model: "דגם בדיקה", status: "חדש",
      delay: "ללא עיכוב", delayReason: "", notes: "", tasks: [], stagedPhotos,
    };
    const [saved, other] = await Promise.all([
      saveRecord("standards", undefined, input, [], admin),
      saveRecord("standards", undefined, { ...input, number: "TEST-2", requestId: randomUUID(), stagedPhotos: [] }, [], employee),
    ]);
    assert.notEqual(saved.id, other.id);
    const record = await getRecord("standards", saved.id);
    assert.equal(record.photos.length, 1);
    const [photo] = record.photos;
    const image = await readBlobPhoto("standards", photo.id);
    assert.equal((await sharp(Buffer.from(await new Response(image).arrayBuffer())).metadata()).format, "webp");
    const backup = await createBackup();
    assert.deepEqual(await listBackups(), [backup.id]);
    await deleteRecord("standards", record.id, record.updatedAt, admin);
    const archived = files.get("cortez/v1/backups/" + backup.id + ".json");
    assert.ok(archived);
    const { state } = JSON.parse(archived.body.toString());
    assert.equal(state.standards.find((item: { id: string }) => item.id === record.id).photos[0].id, photo.id);
    assert.deepEqual(state.sessions, []);
    assert.ok(files.has("cortez/v1/photos/standards/" + photo.id + ".webp"));
    assert.ok(state.users.every((item: { passwordHash: string }) => item.passwordHash !== password));
  } finally {
    setGlobalDispatcher(dispatcher);
    await mock.close();
    delete process.env.CORTEZ_STORAGE_BACKEND;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL_BLOB_API_URL;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
