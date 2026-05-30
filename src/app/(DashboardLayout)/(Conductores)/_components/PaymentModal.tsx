import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Divider,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Checkbox,
  Chip,
  CircularProgress,
  IconButton
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { getFirestore, collection, query, where, getDocs, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { firebaseApp } from '@/utils/firebase';
import toast from 'react-hot-toast';
import { Driver } from './Riders';
import { IconCreditCard, IconCash, IconX, IconCheck } from '@tabler/icons-react';

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  driver: Driver | any;
  onUpdate?: () => void;
}

export interface TripHistory {
  id: string;
  driverId: string;
  originalPrice: number;
  driverEarnings: number;
  commission: number;
  paymentMethod: 'card' | 'cash' | string;
  paid: boolean;
  toDebit: boolean;
  createdAt: any;
  passengerName?: string;
  originAddress?: string;
  destinationAddress?: string;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ open, onClose, driver, onUpdate }) => {
  const [trips, setTrips] = useState<TripHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [selectedTripIds, setSelectedTripIds] = useState<Record<string, boolean>>({});
  
  // Local state to store payment payload for Stripe APIs later
  const [stripePaymentState, setStripePaymentState] = useState<any>(null);

  // Fetch historyTrips from Firestore
  const fetchTrips = async () => {
    if (!driver?.uid) return;
    setLoading(true);
    try {
      const db = getFirestore(firebaseApp);
      const tripsRef = collection(db, 'historyTrips');
      const q = query(tripsRef, where('driverId', '==', driver.uid));
      const querySnapshot = await getDocs(q);
      
      const fetchedTrips: TripHistory[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        fetchedTrips.push({
          id: docSnap.id,
          driverId: data.driverId,
          originalPrice: Number(data.originalPrice || 0),
          driverEarnings: Number(data.driverEarnings || 0),
          commission: Number(data.commission || 0),
          paymentMethod: data.paymentMethod || 'card',
          paid: !!data.paid,
          toDebit: !!data.toDebit,
          createdAt: data.createdAt,
          passengerName: data.passengerName || 'Pasajero',
          originAddress: data.originAddress || data.origin?.address || 'N/A',
          destinationAddress: data.destinationAddress || data.destination?.address || data.address || 'N/A',
        });
      });

      // Filter in memory for pending trips:
      // - Card trips that are not paid: paid === false
      // - Cash trips that are not debited: toDebit === false
      const pendingTrips = fetchedTrips.filter((trip) => {
        if (trip.paymentMethod === 'card') {
          return !trip.paid;
        } else if (trip.paymentMethod === 'cash') {
          return !trip.toDebit;
        }
        return false;
      });

      // Sort by creation date descending
      pendingTrips.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds * 1000 || a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds * 1000 || b.createdAt || 0);
        return dateB - dateA;
      });

      setTrips(pendingTrips);
      
      // Auto-select all trips initially
      const initialSelection: Record<string, boolean> = {};
      pendingTrips.forEach((trip) => {
        initialSelection[trip.id] = true;
      });
      setSelectedTripIds(initialSelection);
    } catch (error) {
      console.error('Error fetching driver trips:', error);
      toast.error('Error al cargar el historial de viajes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchTrips();
      setStripePaymentState(null);
    }
  }, [open, driver]);

  // Derived selections and calculations
  const selectedTrips = useMemo(() => {
    return trips.filter((t) => selectedTripIds[t.id]);
  }, [trips, selectedTripIds]);

  const financialSummary = useMemo(() => {
    let totalDriverEarnings = 0; // Sum of driverEarnings for all selected
    let totalCashDiscount = 0; // Sum of originalPrice for selected cash trips
    let totalLiloCommission = 0; // Sum of commission for all selected

    selectedTrips.forEach((trip) => {
      totalDriverEarnings += trip.driverEarnings;
      totalLiloCommission += trip.commission;
      if (trip.paymentMethod === 'cash') {
        totalCashDiscount += trip.originalPrice;
      }
    });

    const netPayout = totalDriverEarnings - totalCashDiscount;

    return {
      totalDriverEarnings,
      totalCashDiscount,
      totalLiloCommission,
      netPayout
    };
  }, [selectedTrips]);

  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;
    const nextSelection: Record<string, boolean> = {};
    trips.forEach((t) => {
      nextSelection[t.id] = checked;
    });
    setSelectedTripIds(nextSelection);
  };

  const handleSelectTrip = (id: string, checked: boolean) => {
    setSelectedTripIds((prev) => ({
      ...prev,
      [id]: checked
    }));
  };

  const allSelected = trips.length > 0 && trips.every((t) => selectedTripIds[t.id]);
  const someSelected = trips.length > 0 && trips.some((t) => selectedTripIds[t.id]) && !allSelected;

  const handleProcessPayment = async () => {
    if (selectedTrips.length === 0) {
      toast.error('Por favor selecciona al menos un viaje para pagar');
      return;
    }

    if (financialSummary.netPayout <= 0) {
      toast.error('No se puede realizar un pago si el saldo neto es negativo o cero');
      return;
    }

    setProcessing(true);
    try {
      // 1. Prepare payment details payload to save in local state (simulating sending to Stripe API)
      const paymentPayload = {
        driverId: driver.uid,
        driverName: driver.driverName || 'Conductor',
        stripeAccountId: driver.stripeAccountId || 'N/A',
        stripeEmail: driver.stripeEmail || 'N/A',
        payoutMethod: 'stripe_direct',
        processedAt: new Date().toISOString(),
        tripsCount: selectedTrips.length,
        financials: {
          totalDriverEarnings: financialSummary.totalDriverEarnings,
          totalCashDiscount: financialSummary.totalCashDiscount,
          netPayout: financialSummary.netPayout,
          totalLiloCommission: financialSummary.totalLiloCommission
        },
        trips: selectedTrips.map((t) => ({
          tripId: t.id,
          paymentMethod: t.paymentMethod,
          originalPrice: t.originalPrice,
          driverEarnings: t.driverEarnings,
          commission: t.commission
        }))
      };

      // Store in state to simulate Stripe processing
      setStripePaymentState(paymentPayload);
      console.log('Datos de pago guardados en estado local para procesamiento de Stripe (SIMULACIÓN):', paymentPayload);

      // Simulate a small network delay for Stripe verification
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Note: We DO NOT perform Firestore batch write anymore as per user request
      // (payments are marked as paid/debited only when Stripe webhook/response confirms it, which is not yet integrated)

      // Payout processed successfully
      toast.success('Petición de pago enviada a Stripe correctamente (Modo simulación).');
    } catch (error) {
      console.error('Error simulating payment:', error);
      toast.error('Error al simular el pago');
    } finally {
      setProcessing(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  const getTripDateStr = (createdAt: any) => {
    if (!createdAt) return 'Fecha desconocida';
    const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt.seconds * 1000 || createdAt);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Box>
          <Typography variant="h5" fontWeight={600}>
            Liquidación y Pago de Conductor
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {driver?.driverName || 'Conductor'} — ID: {driver?.uid || 'N/A'} — Tel: {driver?.phoneNumber || 'N/A'}
          </Typography>
        </Box>
        <IconButton onClick={onClose} edge="end" aria-label="close">
          <IconX />
        </IconButton>
      </DialogTitle>
      
      <Divider />

      <DialogContent sx={{ p: 3, backgroundColor: '#f8f9fa' }}>
        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8, gap: 2 }}>
            <CircularProgress size={50} />
            <Typography color="textSecondary">Cargando viajes pendientes...</Typography>
          </Box>
        ) : (
          <Grid container spacing={3}>
            {/* Stripe Account & Payout Info Banner */}
            <Grid size={{ xs: 12 }}>
              <Card sx={{ 
                backgroundColor: '#ffffff', 
                borderLeft: '5px solid #6772e5', // Stripe color
                borderRadius: '8px', 
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
              }}>
                <CardContent sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', py: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ 
                      backgroundColor: '#6772e5', 
                      borderRadius: '50%', 
                      width: 40, 
                      height: 40, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      color: 'white'
                    }}>
                      <IconCreditCard size={22} />
                    </Box>
                    <Box>
                      <Typography variant="subtitle1" fontWeight={600} color="textPrimary">
                        Cuenta de Stripe Destinataria
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        ID de cuenta: <strong>{driver?.stripeAccountId || 'No registrada'}</strong> {driver?.stripeEmail ? `(${driver.stripeEmail})` : ''}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ textAlign: { xs: 'left', sm: 'right' }, mt: { xs: 2, sm: 0 } }}>
                    <Typography variant="body2" color="textSecondary">
                      {financialSummary.netPayout > 0 
                        ? 'Monto a transferir al conductor:' 
                        : financialSummary.netPayout < 0 
                        ? 'Monto que debe el conductor:' 
                        : 'Monto a transferir:'}
                    </Typography>
                    <Typography 
                      variant="h5" 
                      fontWeight={800} 
                      color={
                        financialSummary.netPayout > 0 
                          ? '#2e7d32' 
                          : financialSummary.netPayout < 0 
                          ? '#d32f2f' 
                          : 'textSecondary'
                      }
                    >
                      {formatCurrency(Math.abs(financialSummary.netPayout))}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            {!driver?.stripeAccountId && (
              <Grid size={{ xs: 12 }}>
                <Card sx={{ 
                  backgroundColor: '#f8d7da', 
                  borderLeft: '5px solid #dc3545', 
                  borderRadius: '8px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}>
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="body2" color="#721c24" fontWeight={600}>
                      Atención: Este conductor no tiene una cuenta de Stripe afiliada. La opción de procesar pago está deshabilitada.
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            )}

            {financialSummary.netPayout <= 0 && (
              <Grid size={{ xs: 12 }}>
                <Card sx={{ 
                  backgroundColor: '#fff3cd', 
                  borderLeft: '5px solid #ffc107', 
                  borderRadius: '8px'
                }}>
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="body2" color="#856404" fontWeight={600}>
                      Aviso: El saldo neto es negativo o cero. No se puede realizar un pago a Stripe cuando el saldo no es positivo.
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            )}

            {/* Financial Summary Cards */}
            <Grid size={{ xs: 12 }}>
              <Grid container spacing={2}>
                {/* Total driver earnings card */}
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card sx={{ borderLeft: '4px solid #4caf50', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                    <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                      <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                        Total Ganancias Conductor
                      </Typography>
                      <Typography variant="h4" fontWeight={700} color="#2e7d32">
                        {formatCurrency(financialSummary.totalDriverEarnings)}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        Suma de ganancias de viajes seleccionados
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Cash discount card */}
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card sx={{ borderLeft: '4px solid #ef5350', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                    <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                      <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                        Descuento por Efectivo (Cash)
                      </Typography>
                      <Typography variant="h4" fontWeight={700} color="#d32f2f">
                        -{formatCurrency(financialSummary.totalCashDiscount)}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        Suma del valor original de viajes en efectivo
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Net Payout card */}
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card sx={{ 
                    borderLeft: '4px solid #2196f3', 
                    borderRadius: '8px', 
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                    backgroundColor: financialSummary.netPayout >= 0 ? '#e3f2fd' : '#ffebee'
                  }}>
                    <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                      <Typography variant="subtitle2" color="textSecondary" gutterBottom fontWeight={600}>
                        Saldo Neto a Transferir
                      </Typography>
                      <Typography variant="h4" fontWeight={800} color={financialSummary.netPayout >= 0 ? '#1565c0' : '#c62828'}>
                        {formatCurrency(financialSummary.netPayout)}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {financialSummary.netPayout >= 0 ? 'Monto a pagar al conductor' : 'El conductor debe a la empresa'}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Total Lilo Commission card */}
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card sx={{ borderLeft: '4px solid #ff9800', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                    <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                      <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                        Comisión Total Lilo
                      </Typography>
                      <Typography variant="h4" fontWeight={700} color="#ef6c00">
                        {formatCurrency(financialSummary.totalLiloCommission)}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        Suma de la comisión ganada por Lilo
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Grid>

            {/* List of Pending Trips */}
            <Grid size={{ xs: 12 }}>
              <Card sx={{ borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="h6" fontWeight={600}>
                    Viajes Pendientes de Conciliación ({trips.length})
                  </Typography>
                  {selectedTrips.length > 0 && (
                    <Chip 
                      label={`${selectedTrips.length} seleccionados`} 
                      color="primary" 
                      variant="outlined" 
                      size="small" 
                    />
                  )}
                </Box>
                <Divider />
                <Box sx={{ overflowX: 'auto' }}>
                  <Table sx={{ minWidth: 800 }}>
                    <TableHead sx={{ backgroundColor: '#f1f3f5' }}>
                      <TableRow>
                        <TableCell padding="checkbox">
                          <Checkbox
                            indeterminate={someSelected}
                            checked={allSelected}
                            onChange={handleSelectAll}
                          />
                        </TableCell>
                        <TableCell><Typography variant="subtitle2" fontWeight={600}>Fecha y Hora</Typography></TableCell>
                        <TableCell><Typography variant="subtitle2" fontWeight={600}>ID Viaje</Typography></TableCell>
                        <TableCell><Typography variant="subtitle2" fontWeight={600}>Pasajero</Typography></TableCell>
                        <TableCell><Typography variant="subtitle2" fontWeight={600}>Método de Pago</Typography></TableCell>
                        <TableCell align="right"><Typography variant="subtitle2" fontWeight={600}>Precio Original</Typography></TableCell>
                        <TableCell align="right"><Typography variant="subtitle2" fontWeight={600}>Ganancia Conductor</Typography></TableCell>
                        <TableCell align="right"><Typography variant="subtitle2" fontWeight={600}>Comisión Lilo</Typography></TableCell>
                        <TableCell align="right"><Typography variant="subtitle2" fontWeight={600}>Descuento Efectivo</Typography></TableCell>
                        <TableCell align="right"><Typography variant="subtitle2" fontWeight={600}>Neto Viaje</Typography></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {trips.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} align="center" sx={{ py: 6 }}>
                            <Typography color="textSecondary">
                              No hay viajes pendientes de pago o debitar para este conductor.
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        trips.map((trip) => {
                          const isSelected = !!selectedTripIds[trip.id];
                          const isCash = trip.paymentMethod === 'cash';
                          const tripNet = isCash ? (trip.driverEarnings - trip.originalPrice) : trip.driverEarnings;

                          return (
                            <TableRow key={trip.id} hover selected={isSelected}>
                              <TableCell padding="checkbox">
                                <Checkbox
                                  checked={isSelected}
                                  onChange={(e) => handleSelectTrip(trip.id, e.target.checked)}
                                />
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2">{getTripDateStr(trip.createdAt)}</Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                  {trip.id.substring(0, 8)}...
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2">{trip.passengerName}</Typography>
                              </TableCell>
                              <TableCell>
                                <Chip
                                  icon={isCash ? <IconCash size={16} /> : <IconCreditCard size={16} />}
                                  label={isCash ? 'Efectivo (Cash)' : 'Tarjeta'}
                                  color={isCash ? 'warning' : 'success'}
                                  size="small"
                                />
                              </TableCell>
                              <TableCell align="right">
                                <Typography variant="body2">{formatCurrency(trip.originalPrice)}</Typography>
                              </TableCell>
                              <TableCell align="right" sx={{ color: '#2e7d32' }}>
                                <Typography variant="body2" fontWeight={600}>
                                  +{formatCurrency(trip.driverEarnings)}
                                </Typography>
                              </TableCell>
                              <TableCell align="right" sx={{ color: '#ef6c00' }}>
                                <Typography variant="body2">{formatCurrency(trip.commission)}</Typography>
                              </TableCell>
                              <TableCell align="right" sx={{ color: isCash ? '#c62828' : 'text.secondary' }}>
                                <Typography variant="body2">
                                  {isCash ? `-${formatCurrency(trip.originalPrice)}` : '$0.00'}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                <Typography 
                                  variant="body2" 
                                  fontWeight={700}
                                  color={tripNet >= 0 ? '#1565c0' : '#c62828'}
                                >
                                  {tripNet >= 0 ? '+' : ''}{formatCurrency(tripNet)}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </Box>
              </Card>
            </Grid>
          </Grid>
        )}
      </DialogContent>

      <Divider />

      <DialogActions sx={{ p: 2.5, justifyContent: 'space-between' }}>
        <Box>
          {stripePaymentState && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
              <IconCheck size={16} style={{ color: '#4caf50' }} />
              <Typography variant="caption">
                Última transacción guardada en estado local ({stripePaymentState.tripsCount} viajes, Payout: {formatCurrency(stripePaymentState.financials.netPayout)})
              </Typography>
            </Box>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button variant="outlined" onClick={onClose} disabled={processing}>
            Cerrar
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleProcessPayment}
            disabled={processing || selectedTrips.length === 0 || trips.length === 0 || financialSummary.netPayout <= 0 || !driver?.stripeAccountId}
            startIcon={processing ? <CircularProgress size={20} color="inherit" /> : null}
          >
            {processing ? 'Procesando Pago...' : `Pagar Seleccionados (${selectedTrips.length})`}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default PaymentModal;
