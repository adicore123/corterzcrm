import { createUser } from "../src/lib/auth/session";

async function readPassword() {
  if (process.env.CORTEZ_ADMIN_PASSWORD) return process.env.CORTEZ_ADMIN_PASSWORD;
  if (!process.stdin.isTTY) throw new Error("יש להגדיר CORTEZ_ADMIN_PASSWORD או להריץ מתוך מסוף אינטראקטיבי.");

  process.stdout.write("סיסמה (12 תווים לפחות): ");
  process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  process.stdin.resume();
  try {
    return await new Promise<string>((resolve, reject) => {
      let password = "";
      function input(chunk: string) {
        for (const character of chunk) {
          if (character === "\r" || character === "\n" || character === "\u0003") {
            process.stdin.off("data", input);
            if (character === "\u0003") reject(new Error("בוטל."));
            else resolve(password);
            return;
          }
          if (character === "\u007f" || character === "\b") password = password.slice(0, -1);
          else password += character;
        }
      }
      process.stdin.on("data", input);
    });
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write("\n");
  }
}

async function main() {
  const [, , username, name] = process.argv;
  if (!username || !name) throw new Error('שימוש: npm run admin:create -- admin "שם מנהל"');
  const password = await readPassword();
  const user = await createUser({ username, name, password, role: "admin" });
  console.log("חשבון מנהל נוצר:", user.username);
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
