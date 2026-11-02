import { useState, useCallback, useRef } from 'react';
import { useConfirmDialog } from './ConfirmDialog';
import {
  Box,
  Typography,
  IconButton,
  ImageList,
  ImageListItem,
  ImageListItemBar,
  CircularProgress,
  Paper,
  Button,
} from '@mui/material';
import {
  CloudUploadOutlined as UploadIcon,
  DeleteOutlined as DeleteIcon,
  CameraAltOutlined as CameraIcon,
  InsertDriveFileOutlined as FileIcon,
} from '@mui/icons-material';
import { apiRequest } from '../utils/api';
import { useNotification } from '../contexts/NotificationContext';

import { API_BASE } from '../config/api';

/**
 * Reusable photo/file attachment component.
 *
 * Props:
 *   entity     – entity type ('harvest', 'fertigation', 'ecph', 'field')
 *   entityId   – the UUID of the entity
 *   attachments – current list of attachments (from parent state)
 *   onUpdate   – callback to refresh parent's attachment list
 *   readOnly   – disable upload/delete (default false)
 */
export default function PhotoAttachment({ entity, entityId, attachments = [], onUpdate, readOnly = false }) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const notify = useNotification();
  const [confirmDel, confirmDialog] = useConfirmDialog();

  const handleUpload = useCallback(
    async (files) => {
      if (!entityId) {
        notify.warning('Please save the entry first before attaching files.');
        return;
      }
      if (files.length === 0) return;

      setUploading(true);
      try {
        const formData = new FormData();
        Array.from(files).forEach((file) => formData.append('files', file));

        const token = localStorage.getItem('almaha_access_token');
        const response = await fetch(`${API_BASE}/uploads/${entity}/${entityId}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        const data = await response.json();
        if (!data.success) throw new Error(data.error?.message || 'Upload failed');

        notify.success(`${files.length} file(s) uploaded`);
        if (onUpdate) onUpdate();
      } catch (err) {
        notify.error(err.message || 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [entity, entityId, notify, onUpdate]
  );

  const handleDelete = useCallback(
    async (attachmentId) => {
      if (!(await confirmDel('Delete this attachment?', { title: 'Delete Attachment' }))) return;
      try {
        await apiRequest(`/uploads/${attachmentId}`, { method: 'DELETE' });
        notify.success('Attachment deleted');
        if (onUpdate) onUpdate();
      } catch (err) {
        notify.error(err.message || 'Delete failed');
      }
    },
    [notify, onUpdate]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      if (readOnly) return;
      handleUpload(e.dataTransfer.files);
    },
    [handleUpload, readOnly]
  );

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!readOnly) setDragOver(true);
  };

  const isImage = (mime) => mime?.startsWith('image/');

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        Attachments {attachments.length > 0 && `(${attachments.length})`}
      </Typography>

      {!readOnly && (
        <Paper
          variant="outlined"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragOver(false)}
          sx={{
            p: 3,
            mb: 2,
            textAlign: 'center',
            cursor: 'pointer',
            borderStyle: 'dashed',
            borderColor: dragOver ? 'primary.main' : 'divider',
            bgcolor: dragOver ? 'action.hover' : 'transparent',
            transition: 'all 0.2s',
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <CircularProgress size={32} />
          ) : (
            <>
              <UploadIcon sx={{ fontSize: 36, color: 'text.secondary', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                Drag & drop files here, or click to browse
              </Typography>
              <Typography variant="caption" color="text.disabled">
                Max 5 MB per file. Images & PDF accepted.
              </Typography>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple
            accept="image/*,application/pdf"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </Paper>
      )}

      {attachments.length > 0 && (
        <ImageList cols={4} gap={8} sx={{ mt: 1 }}>
          {attachments.map((att) => (
            <ImageListItem
              key={att.id}
              sx={{
                borderRadius: 1,
                overflow: 'hidden',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              {isImage(att.mime_type) ? (
                <img
                  src={att.url}
                  alt={att.original_name}
                  loading="lazy"
                  style={{ height: 140, objectFit: 'cover' }}
                />
              ) : (
                <Box
                  sx={{
                    height: 140,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'grey.100',
                  }}
                >
                  <FileIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
                </Box>
              )}
              <ImageListItemBar
                title={att.original_name}
                subtitle={`${(att.size_bytes / 1024).toFixed(0)} KB`}
                actionIcon={
                  !readOnly && (
                    <IconButton
                      sx={{ color: 'rgba(255,255,255,0.8)' }}
                      size="small"
                      onClick={() => handleDelete(att.id)}
                     aria-label="Delete">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )
                }
              />
            </ImageListItem>
          ))}
        </ImageList>
      )}
      {confirmDialog}
    </Box>
  );
}
