// Values that `vite.config.ts` replaces at build time.
declare const __GIT_COMMIT__: string;
declare const __GIT_BRANCH__: string;
declare const __GIT_DIRTY__: boolean;
declare const __GIT_REPO_URL__: string;
declare const __BUILD_TIME__: string;
declare const __TELEMETRY__: boolean;

export const GIT_COMMIT: string = __GIT_COMMIT__;
export const GIT_BRANCH: string = __GIT_BRANCH__;
export const GIT_DIRTY: boolean = __GIT_DIRTY__;
export const GIT_REPO_URL: string = __GIT_REPO_URL__;
export const BUILD_TIME: string = __BUILD_TIME__;
/** False when the build turns telemetry off. The app then sends nothing and shows no telemetry setting. */
export const TELEMETRY_BUILD_ENABLED: boolean = __TELEMETRY__;

export const GIT_COMMIT_SHORT: string = GIT_COMMIT.slice(0, 7);

export function commitUrl(): string {
	if (!GIT_COMMIT) return GIT_REPO_URL;
	return `${GIT_REPO_URL}/tree/${GIT_COMMIT}`;
}
