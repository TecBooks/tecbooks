import React, { useEffect, useState } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import {
  Box,
  CircularProgress,
  Collapse,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Tooltip,
  Typography,
} from '@mui/material'
import ExpandLess from '@mui/icons-material/ExpandLess'
import ExpandMore from '@mui/icons-material/ExpandMore'
import DeleteOutline from '@mui/icons-material/DeleteOutline'
import { usePrograms } from './ProgramsContext.jsx'
import DeleteProjectDialog from './DeleteProjectDialog.jsx'
import { useDeleteProject } from '@/hooks/sims/project/useDeleteProject'

const PROJECT_PATH = (programId, projectId) =>
  `/sims/project-feasibility/programs/${programId}/${projectId}`

function ProgramsSidebar() {
  const { sidebarPrograms, status } = usePrograms()
  const { programId, projectId } = useParams()
  const navigate = useNavigate()
  const [openIds, setOpenIds] = useState(() => new Set())
  const [pendingDelete, setPendingDelete] = useState(null) // { program, project }
  const deleteProject = useDeleteProject()

  const openDelete = (program, project) => {
    deleteProject.reset()
    setPendingDelete({ program, project })
  }

  const closeDelete = () => {
    if (deleteProject.isPending) return
    setPendingDelete(null)
  }

  const confirmDelete = () => {
    const { program, project } = pendingDelete
    deleteProject.mutate(
      { programId: program.id, projectId: project.id, gameId: project.gameId },
      {
        onSuccess: (result) => {
          setPendingDelete(null)
          // Leave the deleted project's page (or its program's, if it went too).
          const viewingDeletedProject =
            String(program.id) === String(programId) && String(project.id) === String(projectId)
          const viewingDeletedProgram = result?.programDeleted && String(program.id) === String(programId)
          if (viewingDeletedProject || viewingDeletedProgram) {
            navigate('/sims/project-feasibility/programs', { replace: true })
          }
        },
      },
    )
  }

  const deleteError = deleteProject.error
    ? deleteProject.error.response?.status === 404
      ? 'This project no longer exists.'
      : deleteProject.error.response?.data?.error || 'Could not delete the project. Try again.'
    : null

  useEffect(() => {
    if (!programId) return
    setOpenIds((current) => {
      const next = new Set(current)
      next.add(String(programId))
      return next
    })
  }, [programId])

  const toggleProgram = (id) => {
    setOpenIds((current) => {
      const next = new Set(current)
      const key = String(id)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <Box
      component="aside"
      sx={{
        width: 280,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid rgba(7, 58, 90, 0.12)',
        bgcolor: '#f4f7fa',
        height: '100%',
        maxHeight: '100%',
        textAlign: 'left',
      }}
    >
      <Box sx={{ px: 2, py: 2, flexShrink: 0 }}>
        <Typography
          component={NavLink}
          to="/sims/project-feasibility/programs"
          variant="overline"
          sx={{ color: '#073a5a', fontSize: 15, letterSpacing: 1, textDecoration: 'none' }}
        >
          Programs
        </Typography>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {status === 'loading' && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        )}

        {status === 'error' && (
          <Typography sx={{ px: 2, fontSize: 18, color: 'error.main' }}>
            Couldn't load the programs.
          </Typography>
        )}

        {status === 'ready' && sidebarPrograms.length === 0 && (
          <Typography sx={{ px: 2, fontSize: 18, opacity: 0.7 }}>
            No programs yet.
          </Typography>
        )}

        {status === 'ready' && (
          <List disablePadding>
            {sidebarPrograms.map((program) => {
              const isOpen = openIds.has(String(program.id))
              return (
                <Box key={program.id}>
                  <ListItemButton onClick={() => toggleProgram(program.id)} sx={{ px: 2 }}>
                    <ListItemText
                      primary={program.name}
                      primaryTypographyProps={{ fontWeight: 600, fontSize: 20, color: '#073a5a' }}
                    />
                    {isOpen ? <ExpandLess /> : <ExpandMore />}
                  </ListItemButton>
                  <Collapse in={isOpen} timeout="auto" unmountOnExit>
                    <List disablePadding>
                      {program.projects.map((project) => {
                        const selected =
                          String(program.id) === String(programId)
                          && String(project.id) === String(projectId)
                        return (
                          <ListItem
                            key={project.id}
                            disablePadding
                            sx={{
                              // Revealed on hover/keyboard focus; always visible on touch screens.
                              '@media (hover: hover)': {
                                '& .delete-project': { opacity: 0 },
                                '&:hover .delete-project, & .delete-project:focus-visible': { opacity: 1 },
                              },
                            }}
                            secondaryAction={
                              <Tooltip title="Delete project">
                                <IconButton
                                  className="delete-project"
                                  edge="end"
                                  size="small"
                                  aria-label={`Delete project ${project.name}`}
                                  onClick={() => openDelete(program, project)}
                                  sx={{ color: 'error.main' }}
                                >
                                  <DeleteOutline fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            }
                          >
                            <ListItemButton
                              component={NavLink}
                              to={PROJECT_PATH(program.id, project.id)}
                              selected={selected}
                              sx={{ pl: 4, pr: 6, '&.active, &.Mui-selected': { bgcolor: 'rgba(30, 144, 255, 0.12)' } }}
                            >
                              <ListItemText primary={project.name} primaryTypographyProps={{ fontSize: 18 }} />
                            </ListItemButton>
                          </ListItem>
                        )
                      })}
                    </List>
                  </Collapse>
                </Box>
              )
            })}
          </List>
        )}
      </Box>

      <DeleteProjectDialog
        open={Boolean(pendingDelete)}
        project={pendingDelete?.project}
        programName={pendingDelete?.program.name}
        isLastInProgram={pendingDelete?.program.projects.length === 1}
        isDeleting={deleteProject.isPending}
        error={deleteError}
        onCancel={closeDelete}
        onConfirm={confirmDelete}
      />
    </Box>
  )
}

export default ProgramsSidebar
