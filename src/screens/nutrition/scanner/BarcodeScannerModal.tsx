import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator, StyleSheet, Alert, Linking } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
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
  const [torchEnabled, setTorchEnabled] = useState(false);

  const scanLineY = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scanLineY.value = 0;
      scanLineY.value = withRepeat(
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      );
    } else {
      setTorchEnabled(false);
    }
  }, [visible]);

  const scanLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanLineY.value * 180 }],
  }));

  const handleRequestPermission = async () => {
    const result = await requestPermission();
    if (!result.granted) {
      Alert.alert('Доступ к камере', 'Для сканирования штрих-кода нужен доступ к камере.', [
        { text: 'Отмена', style: 'cancel', onPress: onClose },
        { text: 'Настройки', onPress: () => { Linking.openSettings(); onClose(); } },
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
        <>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] }}
          onBarcodeScanned={scanned || loading ? undefined : ({ data }) => onScan(data)}
          facing="back"
          enableTorch={torchEnabled}
        />
        <View style={styles.overlay}>
          <View style={[styles.topArea, { paddingTop: safeTop }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Text style={{ color: '#FFF', fontSize: 16 }}>✕  Закрыть</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTorchEnabled((v) => !v)}
                style={[styles.closeBtn, torchEnabled && styles.torchActive]}
              >
                <Text style={{ color: torchEnabled ? '#FFD60A' : '#FFF', fontSize: 16 }}>
                  {torchEnabled ? '○ Выкл' : '○ Фонарь'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={[typography.body, { color: '#FFF', textAlign: 'center', marginTop: spacing.sm }]}>
              Направь камеру на штрих-код продукта
            </Text>
          </View>

          <View style={styles.scanFrame}>
            {(['TL', 'TR', 'BL', 'BR'] as const).map((pos) => (
              <View key={pos} style={[styles.corner, styles[`corner${pos}`]]} />
            ))}
            {!loading && !scanned && (
              <Animated.View style={[styles.scanLine, scanLineStyle]} />
            )}
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
        </>
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
  torchActive: { backgroundColor: 'rgba(255,214,10,0.2)' },
  scanFrame: { flex: 1, margin: spacing.xl * 2, position: 'relative', overflow: 'hidden' },
  corner: { position: 'absolute', width: 28, height: 28, borderColor: '#FFF' },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  scanLine: { position: 'absolute', left: 4, right: 4, height: 2, backgroundColor: 'rgba(139,92,246,0.9)', borderRadius: 1 },
  bottomArea: { paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
});
