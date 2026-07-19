import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface BackupConfig {
  folder: string | null
  lastBackupAt: string | null
}

const configPath = join(app.getPath('userData'), 'backup-config.json')

export function readBackupConfig(): BackupConfig {
  if (!existsSync(configPath)) return { folder: null, lastBackupAt: null }
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'))
  } catch {
    return { folder: null, lastBackupAt: null }
  }
}

export function writeBackupConfig(config: BackupConfig): void {
  writeFileSync(configPath, JSON.stringify(config, null, 2))
}
