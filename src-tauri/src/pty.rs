use portable_pty::{native_pty_system, CommandBuilder, PtySize, MasterPty};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::thread;
use crossbeam_channel::{Sender, unbounded};
use tauri::{AppHandle, Emitter};

/// PTY 实例
struct PtyInstance {
    writer_tx: Sender<Vec<u8>>,
    master: Box<dyn MasterPty + Send>,
}

/// PTY 管理器：管理多个终端实例
pub struct PtyManager {
    instances: HashMap<u32, PtyInstance>,
    next_id: u32,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            instances: HashMap::new(),
            next_id: 1,
        }
    }

    /// 创建新终端，返回 id
    pub fn spawn(&mut self, rows: u16, cols: u16, cwd: Option<String>, app: AppHandle) -> Result<u32, String> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;

        let cmd = if std::path::Path::new("/bin/zsh").exists() {
            let mut cmd = CommandBuilder::new("zsh");
            cmd.env("TERM", "xterm-256color");
            cmd.env("COLORTERM", "truecolor");
            cmd.env("LANG", "en_US.UTF-8");
            if let Some(ref dir) = cwd {
                cmd.cwd(dir);
            }
            cmd
        } else {
            let mut cmd = CommandBuilder::new("bash");
            cmd.env("TERM", "xterm-256color");
            cmd.env("COLORTERM", "truecolor");
            cmd.env("LANG", "en_US.UTF-8");
            if let Some(ref dir) = cwd {
                cmd.cwd(dir);
            }
            cmd
        };

        let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
        std::mem::forget(child);
        drop(pair.slave);

        let (writer_tx, writer_rx) = unbounded::<Vec<u8>>();

        let id = self.next_id;
        self.next_id += 1;

        // 读线程：PTY → Tauri event
        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let event_id = id;
        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data: Vec<u8> = buf[..n].to_vec();
                        let _ = app.emit("pty-output", serde_json::json!({
                            "ptyId": event_id,
                            "data": data,
                        }));
                    }
                    Err(_) => break,
                }
            }
        });

        // 写线程：input channel → PTY
        let mut writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        thread::spawn(move || {
            while let Ok(data) = writer_rx.recv() {
                if writer.write_all(&data).is_err() {
                    break;
                }
            }
        });

        self.instances.insert(id, PtyInstance { writer_tx, master: pair.master });
        Ok(id)
    }

    /// 向终端写入数据
    pub fn write(&self, id: u32, data: &[u8]) -> Result<(), String> {
        let inst = self.instances.get(&id).ok_or("Terminal not found")?;
        inst.writer_tx.send(data.to_vec()).map_err(|e| e.to_string())
    }

    /// 调整终端大小
    pub fn resize(&self, id: u32, rows: u16, cols: u16) -> Result<(), String> {
        let inst = self.instances.get(&id).ok_or("Terminal not found")?;
        inst.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        }).map_err(|e| e.to_string())
    }

    /// 关闭终端
    pub fn close(&mut self, id: u32) {
        self.instances.remove(&id);
    }
}