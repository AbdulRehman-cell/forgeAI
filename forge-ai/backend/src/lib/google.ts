// Only the Google APIs ForgeAI actually calls. `import { google } from 'googleapis'`
// loads every one of its ~300 API clients — ~60 MB of heap on a server whose
// heap is capped at 120 MB, which left site builds no room and OOM-crashed them.
// These per-API entry points are the same clients for ~4 MB.
import { gmail, auth } from 'googleapis/build/src/apis/gmail'
import { oauth2 } from 'googleapis/build/src/apis/oauth2'

export const google = { gmail, oauth2, auth }
