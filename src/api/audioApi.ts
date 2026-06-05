import { callCommand } from "./tauriClient";

export interface AudioDevice {
  id: string;
  name: string;
  is_default: boolean;
}

export const audioApi = {
  listInputDevices: () => callCommand<AudioDevice[]>("list_input_devices"),
  listOutputDevices: () => callCommand<AudioDevice[]>("list_output_devices"),
  setActiveOutputDevice: (deviceName: string | null) =>
    callCommand<void>("set_active_output_device", {
      deviceName: deviceName && deviceName.length > 0 ? deviceName : null,
    }),
};
