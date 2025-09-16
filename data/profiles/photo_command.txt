
sshpass -p "sudo" ssh root@192.168.254.119 "mkdir -p /var/mobile/Media/Uploads"

sshpass -p "sudo" ssh root@192.168.254.119 "/var/jb/usr/local/bin/photomanager -w Vacances"
sshpass -p "sudo" ssh root@192.168.254.119 "/var/jb/usr/local/bin/photomanager -c Vacances"

sshpass -p "sudo" scp ./photos/*.jpg root@192.168.254.119:/var/mobile/Media/Uploads/

for file in ./photos/*.jpg; do
  filename=$(basename "$file")
  sshpass -p "sudo" ssh root@192.168.254.119 "/var/jb/usr/local/bin/photomanager -s /var/mobile/Media/Uploads/$filename Vacances"
done

sshpass -p "sudo" ssh root@192.168.254.119 "rm -rf /var/mobile/Media/Uploads/*.jpg"
