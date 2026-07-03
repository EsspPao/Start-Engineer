import { resolveLoginExecutable } from "./preferences.js";

export const ADMINISTRATOR_RELAUNCH_ARG = "--administrator-relaunch";
export const STANDARD_RELAUNCH_ARG = "--standard-relaunch";

export function administratorRestartRequired(configured: boolean, current: boolean) {
  return configured !== current;
}

export function shouldRequestAdministratorRelaunch(configured: boolean, current: boolean, args: string[]) {
  const isPrivilegeRelaunch = args.includes(ADMINISTRATOR_RELAUNCH_ARG) || args.includes(STANDARD_RELAUNCH_ARG);
  return configured && !current && !isPrivilegeRelaunch;
}

export function shouldDetectAdministratorSynchronously(configured: boolean, args: string[]) {
  return configured || args.includes(ADMINISTRATOR_RELAUNCH_ARG) || args.includes(STANDARD_RELAUNCH_ARG);
}

export function shouldContinueAfterAdministratorRelaunchAttempt(_result: "launched" | "cancelled") {
  return false;
}

export function buildRestartRequest(execPath: string, portableExecutable: string | undefined, elevated: boolean) {
  return {
    executablePath: resolveLoginExecutable(execPath, portableExecutable),
    args: [elevated ? ADMINISTRATOR_RELAUNCH_ARG : STANDARD_RELAUNCH_ARG],
    elevated,
  };
}
