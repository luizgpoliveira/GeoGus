Add-Type -AssemblyName System.Drawing
foreach ($s in 192,512) {
  $bmp = New-Object System.Drawing.Bitmap($s, $s)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::FromArgb(255, 11, 15, 23))
  # nuvem de fumaça
  $w = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(210, 255, 255, 255))
  $w2 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(130, 255, 255, 255))
  $g.FillEllipse($w, [float]($s*0.435), [float]($s*0.17), [float]($s*0.13), [float]($s*0.085))
  $g.FillEllipse($w2, [float]($s*0.565), [float]($s*0.115), [float]($s*0.085), [float]($s*0.055))
  # montanha vulcânica (laranja com borda amarela)
  $body = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 95, 46))
  $edge = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 255, 176, 46), [float]($s * 0.027))
  $pts = @(
    (New-Object System.Drawing.PointF([float]($s*0.10), [float]($s*0.83))),
    (New-Object System.Drawing.PointF([float]($s*0.40), [float]($s*0.29))),
    (New-Object System.Drawing.PointF([float]($s*0.485), [float]($s*0.46))),
    (New-Object System.Drawing.PointF([float]($s*0.532), [float]($s*0.34))),
    (New-Object System.Drawing.PointF([float]($s*0.63), [float]($s*0.56))),
    (New-Object System.Drawing.PointF([float]($s*0.695), [float]($s*0.40))),
    (New-Object System.Drawing.PointF([float]($s*0.90), [float]($s*0.83)))
  )
  $g.FillPolygon($body, $pts)
  $g.DrawPolygon($edge, $pts)
  # cratera brilhante
  $glow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 176, 46))
  $g.FillEllipse($glow, [float]($s*0.46), [float]($s*0.215), [float]($s*0.055), [float]($s*0.032))
  $g.Dispose()
  $bmp.Save("$PWD\public\icons\icon-$s.png", [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
Get-ChildItem public\icons | Select-Object Name, Length
