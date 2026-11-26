import React from 'react'
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material'

/**
 * "Are you sure?" for deleting a project. Stays open on error so the user
 * sees why it failed; closing is blocked while the request runs.
 */
function DeleteProjectDialog({ open, project, programName, isLastInProgram, isDeleting, error, onCancel, onConfirm }) {
  return (
    <Dialog open={open} onClose={isDeleting ? undefined : onCancel} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, color: '#073a5a' }}>Delete project?</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ fontSize: 17 }}>
          <strong>{project?.name}</strong> will be permanently deleted, with all its data and its
          uploaded Excel file. This can't be undone.
        </DialogContentText>
        {isLastInProgram && (
          <DialogContentText sx={{ mt: 1.5, fontSize: 16 }}>
            It's the only project in <strong>{programName}</strong>, so the program will be deleted too.
          </DialogContentText>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} disabled={isDeleting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={onConfirm}
          disabled={isDeleting}
          startIcon={isDeleting ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {isDeleting ? 'Deleting…' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default DeleteProjectDialog
