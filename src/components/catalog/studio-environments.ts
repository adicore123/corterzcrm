export type StudioEnvironment = "day" | "night" | "gallery";
export const studioEnvironments = {
  day: { title: "אור יום בחוף", background: 0xc4dce0, deck: 0xe6d4b8, collar: 0xd9be97, ambient: 1.15, accent: 2, exposure: 1.08 },
  night: { title: "שעת הזהב", background: 0x3b281c, deck: 0xb98d5e, collar: 0xe6a15c, ambient: 0.85, accent: 4.2, exposure: 1.04 },
  gallery: { title: "דמדומי חוף", background: 0x162238, deck: 0x2c3c55, collar: 0x5c7296, ambient: 0.78, accent: 3.2, exposure: 1.0 },
} satisfies Record<StudioEnvironment, { title: string; background: number; deck: number; collar: number; ambient: number; accent: number; exposure: number }>;
