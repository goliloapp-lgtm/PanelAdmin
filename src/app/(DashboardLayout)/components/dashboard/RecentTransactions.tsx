import React from "react";
import DashboardCard from '@/app/(DashboardLayout)/components/shared/DashboardCard';
import {
  Timeline,
  TimelineItem,
  TimelineOppositeContent,
  TimelineSeparator,
  TimelineDot,
  TimelineConnector,
  TimelineContent,
  timelineOppositeContentClasses,
} from '@mui/lab';
import { Typography } from '@mui/material';

interface RecentTransactionsProps {
  transactions: { time: string; text: string; color: string }[];
}

const RecentTransactions: React.FC<RecentTransactionsProps> = ({ transactions }) => {
  return (
    <DashboardCard title="Viajes Recientes">
      <>
        <Timeline
          className="theme-timeline"
          nonce={undefined}
          onReset={undefined}
          onResetCapture={undefined}
          sx={{
            p: 0,
            mb: '-40px',
            '& .MuiTimelineConnector-root': {
              width: '1px',
              backgroundColor: '#efefef'
            },
            [`& .${timelineOppositeContentClasses.root}`]: {
              flex: 0.5,
              paddingLeft: 0,
            },
          }}
        >
          {transactions.map((tx, idx) => (
            <TimelineItem key={idx}>
              <TimelineOppositeContent>{tx.time}</TimelineOppositeContent>
              <TimelineSeparator>
                <TimelineDot color={tx.color as any} variant="outlined" />
                {idx < transactions.length - 1 && <TimelineConnector />}
              </TimelineSeparator>
              <TimelineContent>
                <Typography variant="body2" fontWeight="500">
                  {tx.text}
                </Typography>
              </TimelineContent>
            </TimelineItem>
          ))}
        </Timeline>
      </>
    </DashboardCard>
  );
};

export default RecentTransactions;
