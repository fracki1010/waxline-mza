import { Writable } from "node:stream";
import { createInterface, type Interface } from "node:readline";
import { MongoClient } from "mongodb";
import { createFirstStaff, describeFailure, exitCodeFor, parseArgs } from "./create-staff.js";

// Output goes through this sink, which swallows everything while a password is being typed.
let muted = false;
const out = new Writable({
  write(chunk, _enc, done) {
    if (!muted) process.stdout.write(chunk as Buffer);
    done();
  },
});

// One readline for both prompts (no keystrokes lost between them), no history, and Ctrl-C or
// Ctrl-D end the prompt with a clear error instead of leaving the promise unsettled.
function ask(rl: Interface, label: string): Promise<string> {
  process.stdout.write(label);
  return new Promise((resolve, reject) => {
    const onClose = () => {
      muted = false;
      process.stdout.write("\n");
      reject(new TypeError("Cancelled"));
    };
    rl.once("close", onClose);
    rl.question("", (answer) => {
      rl.off("close", onClose);
      muted = false;
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) throw new TypeError("Usage: npm run create-staff -- <username> <displayName>");
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new TypeError("MONGODB_URI is required");
  if (!process.stdin.isTTY) throw new TypeError("A terminal is required to type the password");

  const rl = createInterface({
    input: process.stdin,
    output: out,
    terminal: true,
    historySize: 0,
  });
  rl.on("SIGINT", () => rl.close());
  let password: string;
  try {
    password = await ask(rl, "Password: ");
    if (password !== (await ask(rl, "Repeat password: "))) {
      throw new TypeError("Passwords do not match");
    }
  } finally {
    rl.close();
  }

  const client = await MongoClient.connect(uri);
  try {
    const { id } = await createFirstStaff({ db: client.db(), ...args, password, now: new Date() });
    console.log(`Created staff account ${id}`);
  } finally {
    await client.close();
  }
}

try {
  await run();
} catch (error) {
  console.error(describeFailure(error));
  process.exitCode = exitCodeFor(error);
}
