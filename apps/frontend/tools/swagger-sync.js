import chokidar from 'chokidar'
import { exec } from 'child_process'
import path from 'path'
import fs from 'fs'

const SWAGGER_FILE = path.join(
  '..',
  'backend',
  'swagger-output',
  'swagger.json'
)

// show if file exists
if (!fs.existsSync(SWAGGER_FILE)) {
  console.error(
    '❌ Swagger file not found, please start backend once to generate Swagger JSON file',
    SWAGGER_FILE
  )
  process.exit(1)
}

// Function to generate SDK
function generateSDK() {
  console.log('🔄 Swagger file changed, generating SDK...')

  const command = `npx openapi-typescript ${SWAGGER_FILE} -o ./app/lib/api/v1.d.ts`

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ SDK generation failed:', error)
      return
    }

    if (stderr) {
      console.warn('⚠️ SDK generation warnings:', stderr)
    }

    console.log('✅ SDK generated successfully!')
    console.log(stdout)
  })
}

// Watch swagger file
const watcher = chokidar.watch(SWAGGER_FILE, {
  persistent: true,
  ignoreInitial: false, // Generate on startup
})

watcher.on('change', generateSDK)
watcher.on('add', generateSDK)

watcher.on('error', error => {
  console.error('❌ Watcher error:', error)
})

console.log('✅ Swagger sync watcher started successfully!')
