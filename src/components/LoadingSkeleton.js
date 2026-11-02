import { Box, Skeleton, Card, CardContent, Grid } from '@mui/material';

/**
 * Card skeleton for dashboard stats
 */
export function StatCardSkeleton() {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Skeleton variant="text" width="60%" height={24} />
        <Skeleton variant="text" width="40%" height={40} sx={{ mt: 1 }} />
        <Skeleton variant="text" width="80%" height={20} sx={{ mt: 1 }} />
      </CardContent>
    </Card>
  );
}

/**
 * Chart skeleton
 */
export function ChartSkeleton({ height = 300 }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Skeleton variant="text" width="40%" height={28} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={height} sx={{ borderRadius: 1 }} />
      </CardContent>
    </Card>
  );
}

/**
 * Table skeleton
 */
export function TableSkeleton({ rows = 5, columns = 4 }) {
  return (
    <Card>
      <CardContent>
        <Skeleton variant="text" width="30%" height={28} sx={{ mb: 2 }} />
        <Box>
          {/* Header row */}
          <Box sx={{ display: 'flex', gap: 2, mb: 1, pb: 1, borderBottom: '1px solid #eee' }}>
            {Array(columns).fill(0).map((_, i) => (
              <Skeleton key={i} variant="text" width={`${100/columns}%`} height={24} />
            ))}
          </Box>
          {/* Data rows */}
          {Array(rows).fill(0).map((_, rowIndex) => (
            <Box key={rowIndex} sx={{ display: 'flex', gap: 2, py: 1 }}>
              {Array(columns).fill(0).map((_, colIndex) => (
                <Skeleton key={colIndex} variant="text" width={`${100/columns}%`} height={20} />
              ))}
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}

/**
 * Dashboard skeleton - full page loading state
 */
export function DashboardSkeleton() {
  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Skeleton variant="text" width={200} height={40} sx={{ mb: 3 }} />
      
      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Skeleton variant="rectangular" width={200} height={56} sx={{ borderRadius: 1 }} />
        <Skeleton variant="rectangular" width={200} height={56} sx={{ borderRadius: 1 }} />
        <Skeleton variant="rectangular" width={200} height={56} sx={{ borderRadius: 1 }} />
      </Box>

      {/* Stats Grid */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {[1, 2, 3, 4].map((i) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
            <StatCardSkeleton />
          </Grid>
        ))}
      </Grid>

      {/* Charts */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 8 }}>
          <ChartSkeleton height={300} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <ChartSkeleton height={300} />
        </Grid>
      </Grid>
    </Box>
  );
}

/**
 * List skeleton for data entry screens
 */
export function ListSkeleton({ items = 5 }) {
  return (
    <Box>
      {Array(items).fill(0).map((_, i) => (
        <Card key={i} sx={{ mb: 2 }}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Skeleton variant="circular" width={40} height={40} />
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="text" width="60%" height={24} />
              <Skeleton variant="text" width="40%" height={20} />
            </Box>
            <Skeleton variant="rectangular" width={80} height={36} sx={{ borderRadius: 1 }} />
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

export default {
  StatCardSkeleton,
  ChartSkeleton,
  TableSkeleton,
  DashboardSkeleton,
  ListSkeleton,
};
