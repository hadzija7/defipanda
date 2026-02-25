import { spawn } from "node:child_process";
import path from "node:path";

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TIMEOUT_MS = 90_000;

type SimulateResult = {
  ok: boolean;
  command: string;
  cwd: string;
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
};

function runCreSimulation(timeoutMs: number): Promise<SimulateResult> {
  const workflow = process.env.CRE_WORKFLOW_NAME ?? "dca-workflow";
  const target = process.env.CRE_TARGET ?? "staging-settings";
  const command = "cre workflow simulate";
  const args = [command.split(" ")[1], command.split(" ")[2], workflow, "--target", target, "--non-interactive", "--trigger-index", "0"];
  const cwd = path.resolve(process.cwd(), "../cre");
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const child = spawn("cre", args, {
      cwd,
      env: process.env,
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      resolve({
        ok: false,
        command: `${command} ${workflow} --target ${target} --non-interactive --trigger-index 0`,
        cwd,
        exitCode: null,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr: `${stderr}\nSimulation timed out after ${timeoutMs}ms.`,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        command: `${command} ${workflow} --target ${target} --non-interactive --trigger-index 0`,
        cwd,
        exitCode: null,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr: `${stderr}\n${err.message}`,
      });
    });

    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: exitCode === 0,
        command: `${command} ${workflow} --target ${target} --non-interactive --trigger-index 0`,
        cwd,
        exitCode,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
      });
    });
  });
}

export async function POST() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_CRE_SIMULATE !== "true") {
    return NextResponse.json(
      {
        ok: false,
        error: "CRE simulation route is disabled in production.",
      },
      { status: 403 },
    );
  }

  const result = await runCreSimulation(DEFAULT_TIMEOUT_MS);
  const status = result.ok ? 200 : 500;
  return NextResponse.json(result, { status });
}
