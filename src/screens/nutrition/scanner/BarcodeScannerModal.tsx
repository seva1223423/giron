import React from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useThemeStore } from '../../../store';
import { useSafeTop } from '../../../hooks/useSafeTop';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

interface Props {
  visible: boolean;
  loading: boolean;
  scanned: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

export const BarcodeScannerModal: React.FC<Props> = ({ visible, loading, scanned, onClose, onScan }) => {
  const { colors } = useThemeStore();
  const safeTop = useSafeTop();
  const [permission, requestPermission] = useCameraPermissions();

  const handleRequestPermission = async () => {
    const result = await requestPermission();
    if (!result.granted) {
      Alert.alert('Камера', 'Для сканирования штрих-кода нужен доступ к камере. Разрешите в настройках.', [
        { text: 'OK', onPress: onClose },
      ]);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onShow={() => { if (!permission?.granted) handleRequestPermission(); }}>
      <View style={[styles.modal, { backgroundColor: '#000' }]}>
        {!permission?.granted ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl }}>
            <Text style={[typography.body, { color: '#FFF', textAlign: 'center' }]}>Ожидание разрешения камеры...</Text>
            <TouchableOpacity onPress={onClose} style={{ marginTop: spacing.xl }}>
              <Text style={{ color: '#FFF', fontSize: 16 }}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        ) : (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] }}
          onBarcodeScanned={scanned || loading ? undefined : ({ data }) => onScan(data)}
          facing="back"
        />
        <View style={styles.overlay}>
          <View style={[styles.topArea, { paddingTop: safeTop }]}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={{ color: '#FFF', fontSize: 16 }}>✕  Закрыть</Text>
            </TouchableOpacity>
            <Text style={[typography.body, { color: '#FFF', textAlign: 'center', marginTop: spacing.sm }]}>
              Направь камеру на штрих-код продукта
            </Text>
          </View>

          <View style={styles.scanFrame}>
            {(['TL', 'TR', 'BL', 'BR'] as const).map((pos) => (
              <View key={pos} style={[styles.corner, styles[`corner${pos}`]]} />
            ))}
          </View>

          <View style={styles.bottomArea}>
            {loading ? (
              <View style={{ alignItems: 'center', gap: spacing.sm }}>
                <ActivityIndicator color="#FFF" />
                <Text style={[typography.small, { color: '#FFF' }]}>Ищем продукт в базе данных...</Text>
              </View>
            ) : (
              <Text style={[typography.small, { color: 'rgba(255,255,255,0.7)', textAlign: 'center' }]}>
                EAN-13 / EAN-8 / UPC / Code 128
              </Text>
            )}
          </View>
        </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modal: { flex: 1 },
  overlay: { flex: 1 },
  topArea: { paddingBottom: spacing.xl, paddingHorizontal: spacing.xl, backgroundColor: 'rgba(0,0,0,0.6)' },
  closeBtn: { alignSelf: 'flex-start', paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: borderRadius.full, marginBottom: spacing.md, backgroundColor: 'rgba(255,255,255,0.15)' },
  scanFrame: { flex: 1, margin: spacing.xl * 2, position: 'relative' },
  corner: { position: 'absolute', width: 28, height: 28, borderColor: '#FFF' },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  bottomArea: { paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
});
