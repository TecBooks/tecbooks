import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteProjectRequest } from '@/sims/project-feasibility/api/programs.api'

/**
 * Deletes a project, then refreshes the programs catalog (['programs']) and
 * drops the deleted project's cached tab data (['feasibility-model', gameId],
 * plus any other query keyed by that gameId).
 *
 * mutate({ programId, projectId, gameId })
 */
export function useDeleteProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ programId, projectId }) => deleteProjectRequest(programId, projectId),
    onSuccess: async (_result, { gameId }) => {
      if (gameId !== undefined && gameId !== null) {
        queryClient.removeQueries({
          predicate: (query) => query.queryKey.length > 1 && query.queryKey[1] === gameId,
        })
      }
      await queryClient.invalidateQueries({ queryKey: ['programs'] })
    },
  })
}
