/**
 * Map WhatsApp sender phone → authenticated parent (or staff) ServiceContext.
 * Sources: WHATSAPP_PHONE_MAP env + bootstrap student parent phones.
 */

import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import type { AppRole } from "../auth/types";
import { normalizePhone } from "./config";
import { createSeedData } from "../seed";

type PhoneBinding = {
  phone: string;
  userId: string;
  role: AppRole;
  tenantId: string;
  studentId?: string;
  teacherId?: string;
};

function parseEnvMap(): PhoneBinding[] {
  // Format: 905411000102:user_parent_s1:PARENT,9053...:user_admin:SCHOOL_ADMIN
  const raw = process.env.WHATSAPP_PHONE_MAP || "";
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [phone, userId, role, tenantId] = part.split(":");
      return {
        phone: normalizePhone(phone || ""),
        userId: userId || `wa_${normalizePhone(phone || "")}`,
        role: (role as AppRole) || "STUDENT",
        tenantId: tenantId || DEFAULT_TENANT_ID,
      };
    })
    .filter((b) => b.phone);
}

function seedParentBindings(): PhoneBinding[] {
  const seed = createSeedData();
  return seed.students
    .filter((s) => s.parentPhone)
    .map((s) => ({
      phone: normalizePhone(s.parentPhone),
      userId: `user_parent_${s.id}`,
      role: "STUDENT" as AppRole,
      tenantId: seed.settings.tenantId || DEFAULT_TENANT_ID,
      studentId: s.id,
    }));
}

/** Demo default: map common TR test numbers to parent s1 */
function defaultDemoBindings(): PhoneBinding[] {
  return [
    {
      phone: normalizePhone("05411000102"),
      userId: "user_parent_s1",
      role: "STUDENT",
      tenantId: DEFAULT_TENANT_ID,
      studentId: "s1",
    },
    {
      phone: normalizePhone("905411000102"),
      userId: "user_parent_s1",
      role: "STUDENT",
      tenantId: DEFAULT_TENANT_ID,
      studentId: "s1",
    },
  ];
}

export function resolveWhatsAppIdentity(fromPhone: string): ServiceContext | null {
  const phone = normalizePhone(fromPhone);
  if (!phone) return null;

  const bindings = [
    ...parseEnvMap(),
    ...seedParentBindings(),
    ...defaultDemoBindings(),
  ];

  const hit = bindings.find((b) => b.phone === phone || b.phone.endsWith(phone) || phone.endsWith(b.phone));
  if (!hit) return null;

  return {
    role: hit.role,
    userId: hit.userId,
    tenantId: hit.tenantId,
    studentId: hit.studentId,
    teacherId: hit.teacherId,
    channel: "whatsapp",
    requestId: `wa_${crypto.randomUUID().slice(0, 10)}`,
  };
}
