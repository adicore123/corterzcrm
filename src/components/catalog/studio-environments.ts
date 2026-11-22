export type StudioEnvironment = "day" | "night" | "gallery";
export const studioEnvironments = {
  day: { title: "סטודיו בהיר", background: 0xf4f5f8, deck: 0xfcfcfd, collar: 0xd7dbe4, ambient: 1.15, accent: 2, exposure: 1.08 },
  night: { title: "סטודיו לילה", background: 0x0d0e14, deck: 0x1b1d25, collar: 0x282a35, ambient: .65, accent: 5.2, exposure: 1 },
  gallery: { title: "גלריית טיטניום", background: 0x222931, deck: 0x555e69, collar: 0x747f8d, ambient: .95, accent: 2.8, exposure: 1.15 },
} satisfies Record<StudioEnvironment, { title: string; background: number; deck: number; collar: number; ambient: number; accent: number; exposure: number }>;
