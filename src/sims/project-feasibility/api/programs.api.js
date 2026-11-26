import workerApi from '@/utils/worker.util'
import { Logger } from '../utils/logger.js'

const logger = new Logger('ProgramsApi')

export async function createProgramRequest({ name, projects, files }) {
  return logger.time(`createProgramRequest(${name})`, async () => {
    const formData = new FormData()
    formData.append('name', name)
    formData.append('projects', JSON.stringify(projects))
    for (const file of files) {
      formData.append('files', file)
    }
    const { data } = await workerApi.post('/api/programs', formData)
    return data
  })
}

/** Deletes one project (D1 game graph + R2 workbook). Returns { deletedProjectId, programId, programDeleted }. */
export async function deleteProjectRequest(programId, projectId) {
  return logger.time(`deleteProjectRequest(${programId}/${projectId})`, async () => {
    const { data } = await workerApi.delete(`/api/programs/${programId}/projects/${projectId}`)
    return data
  })
}

export async function listProgramsRequest() {
  return logger.time('listProgramsRequest', async () => {
    const { data } = await workerApi.get('/api/programs')
    return data
  })
}
