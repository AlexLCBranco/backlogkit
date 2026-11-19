export class WriteError extends Error {
  status: number
}
export interface Head { branch: string; sha: string }
export function makeWriter(opts: { token: string; fetchImpl?: typeof fetch }): {
  head(repo: string): Promise<Head>
  file(repo: string, path: string, sha: string): Promise<string | null>
  commit(repo: string, head: Head, files: Record<string, string>, message: string): Promise<string>
}
