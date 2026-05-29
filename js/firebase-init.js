import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  EmailAuthProvider,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updatePassword,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  setDoc,
  serverTimestamp,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

let app = null;
let auth = null;
let firestore = null;
let storage = null;
/** Cliente Firestore/Auth/Storage com API usada pelo restante do app. */
let db = null;
/** Resolve quando o Firebase Auth terminou de restaurar a sessão persistida. */
let authReady = Promise.resolve();

function normalizeError(error) {
  const code = error?.code || "";
  if (code === "auth/unauthorized-continue-uri") {
    return {
      message:
        "Dominio nao autorizado no Firebase. Use http://localhost (em vez de 127.0.0.1) ou adicione o dominio em Authentication > Settings > Authorized domains.",
    };
  }
  return { message: error?.message || "Operacao falhou." };
}

/** Firebase so aceita dominios autorizados; localhost costuma estar, 127.0.0.1 nao. */
function normalizeAuthContinueUrl(url) {
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.hostname === "127.0.0.1") {
      parsed.hostname = "localhost";
    }
    return parsed.href;
  } catch {
    return url;
  }
}

export function buildPasswordResetRedirectUrl(relativePath = "redefinir-senha.html") {
  return normalizeAuthContinueUrl(new URL(relativePath, window.location.href).href);
}

function mapUser(user) {
  if (!user) return null;
  return {
    id: user.uid,
    email: user.email || "",
  };
}

function mapDoc(snapshot) {
  return { id: snapshot.id, ...snapshot.data() };
}

function toIsoMaybe(value) {
  if (!value) return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  return value;
}

function normalizeTimestamps(row) {
  if (!row || typeof row !== "object") return row;
  const out = { ...row };
  Object.keys(out).forEach(function (key) {
    out[key] = toIsoMaybe(out[key]);
  });
  return out;
}

function prettifySlug(slug) {
  return String(slug || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
}

async function ensureServiceAreasSeeded() {
  const areasCol = collection(firestore, "service_areas");
  const existing = await getDocs(areasCol);
  if (!existing.empty) return;

  const catalogMod = await import("./service-catalog.js");
  const rowsBySlug = new Map();
  (catalogMod.SERVICE_CATALOG || []).forEach(function (item) {
    if (!item?.slug) return;
    if (!rowsBySlug.has(item.slug)) {
      rowsBySlug.set(item.slug, {
        slug: item.slug,
        name: item.label || prettifySlug(item.slug),
      });
    }
  });

  for (const [slug, row] of rowsBySlug.entries()) {
    await setDoc(doc(firestore, "service_areas", slug), row);
  }
}

function tableDefaults(table, data) {
  const now = new Date().toISOString();
  const next = { ...data };
  if (table === "service_requests" && !next.created_at) next.created_at = now;
  if (table === "provider_notifications" && !next.created_at) next.created_at = now;
  if (table === "completed_services" && !next.completed_at) next.completed_at = now;
  if (table === "providers" && next.terms_accepted_at && !next.created_at) next.created_at = now;
  return next;
}

async function enrichProviderRows(rows, selectColumns) {
  if (!selectColumns || !selectColumns.includes("provider_service_areas")) return rows;
  const linksSnap = await getDocs(collection(firestore, "provider_service_areas"));
  const areasSnap = await getDocs(collection(firestore, "service_areas"));
  const links = linksSnap.docs.map(mapDoc);
  const areasById = new Map();
  areasSnap.docs.forEach(function (d) {
    const row = mapDoc(d);
    areasById.set(d.id, row);
    if (row.slug) areasById.set(row.slug, row);
  });

  return rows.map(function (row) {
    const ownLinks = links.filter((l) => l.provider_id === row.id);
    let provider_service_areas = ownLinks.map(function (l) {
      const areaId = l.area_id || l.service_area_id;
      const areaRow = areaId ? areasById.get(areaId) || null : null;
      return {
        ...l,
        area_id: areaId || null,
        service_areas: areaRow,
      };
    });

    if (selectColumns.includes("provider_service_areas(area_id)")) {
      provider_service_areas = provider_service_areas.map((l) => ({ area_id: l.area_id }));
    }
    return { ...row, provider_service_areas };
  });
}

function buildConstraints(filters, order, limitCount) {
  const constraints = [];
  filters.forEach(function (f) {
    if (f.op === "eq" && f.field === "id") return;
    if (f.op === "eq") constraints.push(where(f.field, "==", f.value));
    if (f.op === "gte") constraints.push(where(f.field, ">=", f.value));
    if (f.op === "is" && f.value === null) constraints.push(where(f.field, "==", null));
  });
  if (order) constraints.push(orderBy(order.field, order.ascending ? "asc" : "desc"));
  if (typeof limitCount === "number") constraints.push(limit(limitCount));
  return constraints;
}

/** Filtro único por id do documento Firestore (não é campo no payload). */
function getDocumentIdFilter(filters) {
  if (filters.length !== 1) return null;
  const f = filters[0];
  if (f.op === "eq" && f.field === "id") return String(f.value);
  return null;
}

function applyClientSort(rows, order, limitCount) {
  if (!order || !rows?.length) return rows;
  const sorted = [...rows].sort(function (a, b) {
    const av = a[order.field];
    const bv = b[order.field];
    if (av === bv) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = av < bv ? -1 : 1;
    return order.ascending ? cmp : -cmp;
  });
  if (typeof limitCount === "number") return sorted.slice(0, limitCount);
  return sorted;
}

class DbQuery {
  constructor(table) {
    this.table = table;
    this._filters = [];
    this._select = null;
    this._order = null;
    this._limit = null;
    this._head = false;
    this._count = null;
    this._op = "select";
    this._payload = null;
    this._onConflict = null;
    this._expect = null;
  }

  select(columns, options) {
    this._select = columns || "*";
    this._head = Boolean(options?.head);
    this._count = options?.count || null;
    const writeOps = ["insert", "upsert", "update", "delete"];
    if (!writeOps.includes(this._op)) this._op = "select";
    return this;
  }

  order(field, options) {
    this._order = { field, ascending: options?.ascending !== false };
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  eq(field, value) {
    this._filters.push({ op: "eq", field, value });
    return this;
  }

  gte(field, value) {
    this._filters.push({ op: "gte", field, value });
    return this;
  }

  is(field, value) {
    this._filters.push({ op: "is", field, value });
    return this;
  }

  insert(payload) {
    this._op = "insert";
    this._payload = payload;
    return this;
  }

  update(payload) {
    this._op = "update";
    this._payload = payload;
    return this;
  }

  upsert(payload, options) {
    this._op = "upsert";
    this._payload = payload;
    this._onConflict = options?.onConflict || null;
    return this;
  }

  delete() {
    this._op = "delete";
    return this;
  }

  single() {
    this._expect = "single";
    return this._execute();
  }

  maybeSingle() {
    this._expect = "maybeSingle";
    return this._execute();
  }

  then(resolve, reject) {
    return this._execute().then(resolve, reject);
  }

  async _readRows() {
    const docId = getDocumentIdFilter(this._filters);
    if (docId) {
      const snap = await getDoc(doc(firestore, this.table, docId));
      let rows = snap.exists() ? [normalizeTimestamps(mapDoc(snap))] : [];
      if (this.table === "providers") rows = await enrichProviderRows(rows, this._select || "");
      rows = applyClientSort(rows, this._order, this._limit);
      return { data: rows, error: null, count: null };
    }

    const colRef = collection(firestore, this.table);
    const constraints = buildConstraints(this._filters, this._order, this._limit);
    const q = constraints.length ? query(colRef, ...constraints) : query(colRef);

    if (this._head && this._count === "exact") {
      const countRes = await getCountFromServer(q);
      return { data: null, count: countRes.data().count, error: null };
    }

    try {
      const snap = await getDocs(q);
      let rows = snap.docs.map(mapDoc).map(normalizeTimestamps);
      if (this.table === "providers") rows = await enrichProviderRows(rows, this._select || "");
      return { data: rows, error: null, count: null };
    } catch (error) {
      const needsIndex =
        this._order &&
        (String(error?.message || "").includes("index") ||
          error?.code === "failed-precondition");
      if (!needsIndex) throw error;

      const fallbackQ = query(colRef, ...buildConstraints(this._filters, null, null));
      const snap = await getDocs(fallbackQ);
      let rows = snap.docs.map(mapDoc).map(normalizeTimestamps);
      if (this.table === "providers") rows = await enrichProviderRows(rows, this._select || "");
      rows = applyClientSort(rows, this._order, this._limit);
      return { data: rows, error: null, count: null };
    }
  }

  async _writeInsert() {
    const values = Array.isArray(this._payload) ? this._payload : [this._payload];
    const inserted = [];
    for (const value of values) {
      const data = tableDefaults(this.table, value || {});
      let docRef;
      const fixedId =
        (typeof data.id === "string" && data.id) ||
        (this.table === "providers" && data.auth_user_id) ||
        null;
      if (fixedId) {
        docRef = doc(firestore, this.table, fixedId);
        const copy = { ...data };
        delete copy.id;
        await setDoc(docRef, copy, { merge: true });
      } else {
        docRef = await addDoc(collection(firestore, this.table), data);
      }
      const snap = await getDoc(docRef);
      inserted.push(normalizeTimestamps(mapDoc(snap)));
    }
    return { data: Array.isArray(this._payload) ? inserted : inserted[0] || null, error: null };
  }

  async _writeUpdate() {
    const docId = getDocumentIdFilter(this._filters);
    if (docId) {
      const refDoc = doc(firestore, this.table, docId);
      const snap = await getDoc(refDoc);
      if (!snap.exists()) {
        return { data: [], error: { message: "Registro nao encontrado." } };
      }
      await updateDoc(refDoc, this._payload || {});
      const updatedSnap = await getDoc(refDoc);
      const row = normalizeTimestamps(mapDoc(updatedSnap));
      return { data: [row], error: null };
    }

    const rows = await this._readRows();
    if (rows.error) return rows;
    const updates = rows.data || [];
    if (!updates.length) {
      return { data: [], error: { message: "Registro nao encontrado." } };
    }
    for (const row of updates) {
      const refDoc = doc(firestore, this.table, row.id);
      await updateDoc(refDoc, this._payload || {});
    }
    return { data: updates, error: null };
  }

  async _writeDelete() {
    const docId = getDocumentIdFilter(this._filters);
    if (docId) {
      const refDoc = doc(firestore, this.table, docId);
      const snap = await getDoc(refDoc);
      if (!snap.exists()) return { data: [], error: null };
      const row = normalizeTimestamps(mapDoc(snap));
      await deleteDoc(refDoc);
      return { data: [row], error: null };
    }

    const rows = await this._readRows();
    if (rows.error) return rows;
    for (const row of rows.data || []) {
      await deleteDoc(doc(firestore, this.table, row.id));
    }
    return { data: rows.data || [], error: null };
  }

  async _writeUpsert() {
    const payload = this._payload || {};
    const conflictKey = this._onConflict;
    if (!conflictKey || !payload[conflictKey]) {
      this._payload = payload;
      return this._writeInsert();
    }
    const existing = await new DbQuery(this.table).select("*").eq(conflictKey, payload[conflictKey]).maybeSingle();
    if (existing.error) return existing;
    if (existing.data?.id) {
      const targetId = existing.data.id;
      const copy = { ...payload };
      delete copy.id;
      await setDoc(doc(firestore, this.table, targetId), copy, { merge: true });
      const updatedSnap = await getDoc(doc(firestore, this.table, targetId));
      return { data: normalizeTimestamps(mapDoc(updatedSnap)), error: null };
    }
    if (conflictKey === "auth_user_id" && payload.auth_user_id) {
      this._payload = { ...payload, id: payload.auth_user_id };
      return this._writeInsert();
    }
    if (conflictKey === "id" && payload.id) {
      this._payload = payload;
      return this._writeInsert();
    }
    this._payload = payload;
    return this._writeInsert();
  }

  async _execute() {
    try {
      if (this._op === "insert") {
        const res = await this._writeInsert();
        if (this._expect === "single") return { ...res, data: res.data || null };
        return res;
      }
      if (this._op === "update") {
        const res = await this._writeUpdate();
        if (this._expect === "single") return { ...res, data: (res.data || [])[0] || null };
        if (this._expect === "maybeSingle") return { ...res, data: (res.data || [])[0] || null };
        return res;
      }
      if (this._op === "delete") {
        const res = await this._writeDelete();
        if (this._expect === "single" || this._expect === "maybeSingle") {
          return { ...res, data: (res.data || [])[0] || null };
        }
        return res;
      }
      if (this._op === "upsert") {
        const res = await this._writeUpsert();
        if (this._expect === "single") return { ...res, data: res.data || null };
        return res;
      }

      const res = await this._readRows();
      if (this._expect === "single") {
        if ((res.data || []).length !== 1) return { data: null, error: { message: "Registro nao encontrado." } };
        return { ...res, data: res.data[0] };
      }
      if (this._expect === "maybeSingle") {
        return { ...res, data: (res.data || [])[0] || null };
      }
      return res;
    } catch (error) {
      return { data: null, error: normalizeError(error), count: null };
    }
  }
}

function createStorageApi() {
  return {
    from(bucket) {
      return {
        async upload(path, file) {
          try {
            const storageRef = ref(storage, `${bucket}/${path}`);
            await uploadBytes(storageRef, file);
            const publicUrl = await getDownloadURL(storageRef);
            return { data: { path, publicUrl }, error: null };
          } catch (error) {
            return { data: null, error: normalizeError(error) };
          }
        },
        getPublicUrl(path) {
          const encodedPath = encodeURIComponent(`${bucket}/${path}`);
          const bucketName = storage?.app?.options?.storageBucket || "";
          return {
            data: {
              publicUrl: `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media`,
            },
          };
        },
      };
    },
  };
}

async function deleteProviderCascadeByUserId(userId) {
  const provRes = await new DbQuery("providers").select("*").eq("auth_user_id", userId).maybeSingle();
  const provider = provRes.data;
  if (!provider?.id) return;
  const providerId = provider.id;

  const relatedTables = [
    "provider_service_areas",
    "provider_notifications",
    "provider_dismissed_requests",
    "completed_services",
  ];

  for (const table of relatedTables) {
    const rows = await new DbQuery(table).select("*").eq("provider_id", providerId);
    for (const row of rows.data || []) {
      await deleteDoc(doc(firestore, table, row.id));
    }
  }
  await deleteDoc(doc(firestore, "providers", providerId));
}

function createRpcApi() {
  return async function rpc(name, params) {
    try {
      if (name === "create_provider_notification") {
        const payload = {
          provider_id: params?.p_provider_id,
          type: params?.p_type || "info",
          title: params?.p_title || "Notificacao",
          message: params?.p_message || "",
          created_at: new Date().toISOString(),
          read_at: null,
        };
        const inserted = await new DbQuery("provider_notifications").insert(payload);
        return inserted;
      }

      if (name === "delete_own_provider_account") {
        const user = auth.currentUser;
        if (!user) return { data: null, error: { message: "Usuario nao autenticado." } };
        await deleteProviderCascadeByUserId(user.uid);
        await deleteUser(user);
        return { data: true, error: null };
      }

      return { data: null, error: { message: "RPC nao implementado: " + name } };
    } catch (error) {
      return { data: null, error: normalizeError(error) };
    }
  };
}

function createAuthApi() {
  return {
    async signUp(payload) {
      try {
        const cred = await createUserWithEmailAndPassword(auth, payload.email, payload.password);
        return {
          data: {
            user: mapUser(cred.user),
            session: { user: mapUser(cred.user) },
          },
          error: null,
        };
      } catch (error) {
        return { data: { user: null, session: null }, error: normalizeError(error) };
      }
    },
    async signInWithPassword(payload) {
      try {
        const cred = await signInWithEmailAndPassword(auth, payload.email, payload.password);
        return {
          data: {
            user: mapUser(cred.user),
            session: { user: mapUser(cred.user) },
          },
          error: null,
        };
      } catch (error) {
        return { data: { user: null, session: null }, error: normalizeError(error) };
      }
    },
    async signOut() {
      try {
        await firebaseSignOut(auth);
        return { error: null };
      } catch (error) {
        return { error: normalizeError(error) };
      }
    },
    async getUser() {
      await authReady;
      return { data: { user: mapUser(auth.currentUser) }, error: null };
    },
    async getSession() {
      await authReady;
      const user = mapUser(auth.currentUser);
      return { data: { session: user ? { user } : null }, error: null };
    },
    onAuthStateChange(callback) {
      const unsub = onAuthStateChanged(auth, function (user) {
        const params = new URLSearchParams(window.location.search);
        const recovery =
          Boolean(params.get("oobCode")) &&
          (params.get("mode") === "resetPassword" || !params.get("mode"));
        if (user && recovery) {
          callback("PASSWORD_RECOVERY", { user: mapUser(user) });
          return;
        }
        callback(user ? "SIGNED_IN" : "SIGNED_OUT", user ? { user: mapUser(user) } : null);
      });
      return { data: { subscription: { unsubscribe: unsub } } };
    },
    async resetPasswordForEmail(email, options) {
      try {
        const redirectUrl = normalizeAuthContinueUrl(
          options?.redirectTo || window.location.href
        );
        await sendPasswordResetEmail(auth, email, {
          url: redirectUrl,
          handleCodeInApp: true,
        });
        return { data: true, error: null };
      } catch (error) {
        return { data: null, error: normalizeError(error) };
      }
    },
    async updateUser(payload) {
      try {
        const password = payload?.password;
        if (!password) return { data: null, error: { message: "Nada para atualizar." } };
        const code = new URLSearchParams(window.location.search).get("oobCode");
        if (code) {
          await confirmPasswordReset(auth, code, password);
          return { data: true, error: null };
        }
        const user = auth.currentUser;
        if (!user) return { data: null, error: { message: "Sessao expirada." } };
        await updatePassword(user, password);
        return { data: true, error: null };
      } catch (error) {
        return { data: null, error: normalizeError(error) };
      }
    },
    async reauthenticate({ email, password }) {
      try {
        const user = auth.currentUser;
        if (!user) return { data: null, error: { message: "Sessao expirada." } };
        const credential = EmailAuthProvider.credential(email, password);
        await reauthenticateWithCredential(user, credential);
        return { data: true, error: null };
      } catch (error) {
        return { data: null, error: normalizeError(error) };
      }
    },
  };
}

try {
  const mod = await import("./firebase-config.js");
  const firebaseConfig = mod?.FIREBASE_CONFIG || mod?.firebaseConfig || null;
  const validConfig = firebaseConfig && !String(firebaseConfig.projectId || "").includes("SEU-PROJETO");
  if (validConfig) {
    app = initializeApp(firebaseConfig);
    const authMod = await import("https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js");
    auth = authMod.getAuth(app);
    authReady = new Promise(function (resolve) {
      const unsub = onAuthStateChanged(auth, function () {
        unsub();
        resolve();
      });
    });
    firestore = getFirestore(app);
    storage = getStorage(app);

    db = {
      auth: createAuthApi(),
      from(table) {
        return new DbQuery(table);
      },
      storage: createStorageApi(),
      rpc: createRpcApi(),
    };

    ensureServiceAreasSeeded().catch(function (err) {
      console.warn("Nao foi possivel popular service_areas:", err);
    });
  }
} catch (err) {
  console.error("Firebase nao inicializado:", err);
}

export { db };
